// Acceptance tests only against a disposable loopback Atlas instance. Fixtures are removed in finally.
const { request } = require(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const env = Object.fromEntries(fs.readFileSync(process.env.ATLAS_QA_ENV || '.env.qa', 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
const baseURL = env.APP_URL;
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), 'Disposable loopback instance required.');
const databaseURL = new URL(env.DATABASE_URL);
databaseURL.hostname = '127.0.0.1'; databaseURL.port = process.env.ATLAS_QA_DB_PORT || '55441';
const db = new PrismaClient({ datasourceUrl: databaseURL.toString() });
const prefix = `calendar-export-qa-${crypto.randomUUID()}`;
const qaDirectory = path.resolve('.qa'); fs.mkdirSync(qaDirectory, { recursive: true });
const results = [];
const personalIds = [];
let admin, memberContext, member, space;

async function json(context, route, data, method = 'GET', status = 200) {
  const response = await context.fetch(route, { method, ...(data === undefined ? {} : { data }) });
  const text = await response.text();
  assert.equal(response.status(), status, `${route}: ${text}`);
  return text ? JSON.parse(text) : null;
}
async function signIn(context, email, password) {
  const csrf = await json(context, '/api/auth/csrf');
  const response = await context.post('/api/auth/callback/credentials', { form: { csrfToken: csrf.csrfToken, email, password, json: 'true', callbackUrl: `${baseURL}/` } });
  assert(response.ok(), 'Credentials callback failed');
  const session = await json(context, '/api/auth/session');
  assert(session.user?.id, 'Authenticated cookie session missing');
  return session.user.id;
}
async function createEntry(context, input) {
  const result = await json(context, '/api/calendar/entries', input, 'POST', 201);
  personalIds.push(result.entry.id); return result.entry;
}
async function importTodos(context, spaceId, title, source, status = 201) {
  const response = await context.post('/api/pages/import', { multipart: { spaceId, title, file: { name: 'acceptance.todos.json', mimeType: 'application/json', buffer: Buffer.from(source) } } });
  const body = await response.text(); assert.equal(response.status(), status, `Todo import: ${body}`);
  return JSON.parse(body);
}
async function download(context, scope, filename) {
  const response = await context.get(`/api/backups/export?scope=${scope}`);
  assert.equal(response.status(), 200, 'Portable backup failed');
  assert.match(response.headers()['content-type'], /application\/zip/);
  const file = path.join(qaDirectory, filename); fs.writeFileSync(file, await response.body()); return file;
}
function inspectZip(file, expectedOwner, ownId, foreignId, foreignTitle, boardId) {
  const python = process.env.ATLAS_PYTHON || 'python';
  const program = [
    'import json,sys,zipfile',
    'file,owner,own,foreign,marker,board=sys.argv[1:]',
    'with zipfile.ZipFile(file) as z:',
    ' manifest=json.loads(z.read("manifest.json"))',
    ' assert manifest["formatVersion"] == 4',
    ' assert manifest["personalCalendarPath"] == "calendar/personal.json"',
    ' calendar=json.loads(z.read(manifest["personalCalendarPath"]))',
    ' assert any(e["id"]==own for e in calendar["entries"])',
    ' assert all(e["userId"]==owner and e["id"]!=foreign for e in calendar["entries"])',
    ' assert all(e["userId"]==owner for e in calendar["exceptions"])',
    ' assert any(e["entryId"]==own for e in calendar["exceptions"])',
    ' assert calendar["preferences"] is None or calendar["preferences"]["userId"]==owner',
    ' assert all(marker.encode() not in z.read(n) for n in z.namelist())',
    ' boardpath=next(p["sourcePath"] for s in manifest["spaces"] for p in s["pages"] if p["id"]==board)',
    ' print(json.dumps({"ownerOnly":True,"exceptions":True,"manifestVersion":manifest["formatVersion"],"todos":json.loads(z.read(boardpath))}))',
  ].join('\n');
  const parsed = spawnSync(python, ['-c', program, file, expectedOwner, ownId, foreignId, foreignTitle, boardId], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr); return JSON.parse(parsed.stdout);
}
function fullDatabaseBackup(ownerMarker, foreignMarker) {
  const container = process.env.ATLAS_QA_POSTGRES_CONTAINER || 'atlas-calendar-qa-postgres-1';
  assert.match(container, /^atlas-calendar-qa-postgres-\d+$/, 'Disposable QA PostgreSQL container required');
  const dumped = spawnSync('docker', ['exec', container, 'pg_dump', '-U', env.POSTGRES_USER || 'atlas', '-d', env.POSTGRES_DB || 'atlas', '-Fc'], { maxBuffer: 128 * 1024 * 1024 });
  assert.equal(dumped.status, 0, String(dumped.stderr));
  const file = path.join(qaDirectory, 'final-calendar-backup.dump'); fs.writeFileSync(file, dumped.stdout);
  const listing = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '-l'], { input: dumped.stdout, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  assert.equal(listing.status, 0, listing.stderr);
  const tables = ['CalendarEntry', 'CalendarException', 'CalendarPreference', 'TodoTaskIndex'];
  for (const table of tables) { assert(listing.stdout.includes(`TABLE public ${table}`)); assert(listing.stdout.includes(`TABLE DATA public ${table}`)); }
  const data = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '--data-only', '--table=CalendarEntry', '--file=-'], { input: dumped.stdout, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  assert.equal(data.status, 0, data.stderr); assert(data.stdout.includes(ownerMarker)); assert(data.stdout.includes(foreignMarker));
  return { file: path.basename(file), tables, bothOwnerCalendarsIncluded: true };
}
async function main() {
  try {
    admin = await request.newContext({ baseURL });
    const adminId = await signIn(admin, env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
    const password = crypto.randomBytes(24).toString('hex');
    member = await json(admin, '/api/users', { name: `${prefix} member`, email: `${prefix}@example.test`, password }, 'POST', 201);
    memberContext = await request.newContext({ baseURL }); await signIn(memberContext, member.email, password);
    const ownTitle = `${prefix} owner-private`;
    const foreignTitle = `${prefix} member-private`;
    const own = await createEntry(admin, { kind: 'todo', title: ownTitle, dueDate: '2026-09-30', recurrence: { frequency: 'daily', interval: 1, count: 3 } });
    await json(admin, `/api/calendar/entries/${own.id}`, { revision: own.revision, occurrenceKey: '2026-10-01', scope: 'occurrence', completed: true }, 'PATCH');
    const foreign = await createEntry(memberContext, { kind: 'todo', title: foreignTitle, dueDate: '2026-09-30' });
    const personalExport = await json(admin, '/api/calendar/export');
    assert(personalExport.entries.some(e => e.id === own.id)); assert(personalExport.entries.every(e => e.userId === adminId));
    assert(!JSON.stringify(personalExport).includes(foreign.id));
    space = await json(admin, '/api/spaces', { name: `${prefix} space` }, 'POST', 201);
    await json(admin, `/api/spaces/${space.id}/permissions`, { users: [{ id: adminId, role: 'OWNER' }, { id: member.id, role: 'EDITOR' }], teams: [] }, 'PUT');
    const tasks = [
      { id: `${prefix}-done`, title: 'Completed dependency', description: 'Original imported text', column: 'COMPLETED', priority: 'MEDIUM', deadline: '2026-09-29', blockedBy: [], assigneeIds: [adminId], createdAt: 100, updatedAt: 200 },
      { id: `${prefix}-dependent`, title: 'Dependent task', description: 'Preserved dependent description', column: 'NEW', priority: 'HIGH', deadline: '2026-10-01', blockedBy: [`${prefix}-done`], assigneeIds: [adminId, member.id], createdAt: 300, updatedAt: 400 },
    ];
    const source = JSON.stringify({ format: 'atlas-todos', version: 1, tasks });
    const board = await importTodos(admin, space.id, `${prefix} original-board`, source);
    assert.equal(board.format, 'TODO');
    for (const task of tasks) assert.deepEqual((await json(admin, `/api/calendar/tasks/${board.id}/${task.id}`)).task, task);
    const accessible = inspectZip(await download(admin, 'accessible', 'calendar-export-accessible.zip'), adminId, own.id, foreign.id, foreignTitle, board.id);
    const instance = inspectZip(await download(admin, 'instance', 'calendar-export-instance.zip'), adminId, own.id, foreign.id, foreignTitle, board.id);
    const byId = list => [...list].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(accessible.todos.tasks), byId(tasks)); assert.deepEqual(byId(instance.todos.tasks), byId(tasks));
    results.push({ check: 'Both portable ZIP scopes contain only requesting owner calendar, its recurrence and exception; another user private title/ID absent', passed: true });
    const copy = await importTodos(admin, space.id, `${prefix} copied-board`, JSON.stringify(instance.todos));
    assert.notEqual(copy.id, board.id);
    for (const task of tasks) assert.deepEqual((await json(admin, `/api/calendar/tasks/${copy.id}/${task.id}`)).task, task);
    await json(admin, `/api/pages/${board.id}`, undefined, 'DELETE', 204);
    await json(admin, `/api/calendar/tasks/${board.id}/${tasks[1].id}`, undefined, 'GET', 403);
    assert.deepEqual((await json(admin, `/api/calendar/tasks/${copy.id}/${tasks[1].id}`)).task, tasks[1]);
    results.push({ check: 'Todo ZIP export and re-import preserve IDs, assignees, dependencies, state and timestamps; copied board remains independent after original deletion', passed: true });
    const invalid = JSON.stringify({ format: 'atlas-todos', version: 1, tasks: [{ ...tasks[0], assigneeIds: ['nonexistent-assignee'] }] });
    const invalidResult = await importTodos(admin, space.id, `${prefix} invalid-assignment`, invalid, 400); assert.equal(invalidResult.code, 'TODO_IMPORT_ASSIGNEES_INVALID');
    assert.equal(await db.page.count({ where: { spaceId: space.id, title: `${prefix} invalid-assignment` } }), 0);
    const invalidDependency = await importTodos(admin, space.id, `${prefix} invalid-dependency`, JSON.stringify({ format: 'atlas-todos', version: 1, tasks: [{ ...tasks[1], blockedBy: ['missing'] }] }), 400);
    assert.equal(invalidDependency.code, 'FILE_INVALID_CONTENT');
    results.push({ check: 'Ineligible assignees and missing dependencies are rejected visibly with no partially imported page', passed: true });
    await json(admin, '/api/pages', { title: `${prefix} disabled-gantt`, spaceId: space.id, format: 'GANTT' }, 'POST', 400);
    assert.equal(await db.page.count({ where: { spaceId: space.id, format: 'GANTT' } }), 0);
    results.push({ check: 'GANTT POST rejected and no Gantt page created', passed: true });
    results.push({ check: 'Full PostgreSQL dump includes all four calendar/index tables and both users private entries', passed: true, ...fullDatabaseBackup(ownTitle, foreignTitle) });
    fs.writeFileSync(path.join(qaDirectory, 'calendar-export-results.json'), JSON.stringify({ results }, null, 2));
    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    if (space && admin) await json(admin, `/api/spaces/${space.id}`, { confirmation: space.name }, 'DELETE', 204);
    if (personalIds.length) await db.calendarEntry.deleteMany({ where: { id: { in: personalIds }, title: { startsWith: prefix } } });
    if (member) await db.user.deleteMany({ where: { id: member.id, email: member.email } });
    const remaining = await db.calendarEntry.count({ where: { title: { startsWith: prefix } } });
    assert.equal(remaining, 0, 'Calendar fixture cleanup failed');
    await Promise.all([admin?.dispose(), memberContext?.dispose(), db.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
