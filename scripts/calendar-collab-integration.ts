import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { SignJWT } from "jose";
import * as Y from "yjs";
import { TODO_BOARD_MAP, addTodoTask, copyTodoBoard, decodeTodoTasks, deleteTodoTask, initializeTodoBoard, readTodoTasks, updateTodoTask } from "@atlas/todo";
import { replaceTodoIndex, todoTaskStateHash } from "@atlas/todo/persistence";

// This script is deliberately restricted to a disposable localhost QA stack.
if (process.env.ATLAS_TEST_DATABASE !== "1") throw new Error("ATLAS_TEST_DATABASE=1 is required.");
const env = Object.fromEntries(readFileSync(process.env.ATLAS_QA_ENV || ".env.qa", "utf8").split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const separator = line.indexOf("="); return [line.slice(0, separator), line.slice(separator + 1)]; }));
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
assert(loopback.has(new URL(env.APP_URL).hostname), "APP_URL must point to localhost.");
const databaseUrl = new URL(env.DATABASE_URL);
if (databaseUrl.hostname === "postgres" && (!databaseUrl.port || databaseUrl.port === "5432")) {
  databaseUrl.hostname = "127.0.0.1";
  databaseUrl.port = "55441";
}
assert(loopback.has(databaseUrl.hostname), "The QA database must be exposed only on localhost.");
assert.equal(databaseUrl.port, "55441", "Use the dedicated disposable QA PostgreSQL port.");
const secret = env.AUTH_SECRET;
assert(secret && secret.length >= 32, "QA AUTH_SECRET is required.");
assert(typeof globalThis.WebSocket === "function", "Node 22 or newer with the native WebSocket API is required.");
const collabPort = Number(env.COLLAB_PORT || 30023);
assert.equal(collabPort, 30023, "Use the dedicated disposable QA Collab port.");
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
const prefix = `calendar-live-collab-qa-${crypto.randomUUID()}`;
const userIds = ["writer", "peer", "outsider", "team", "viewer"].map((name) => `${prefix}-${name}`);
const [writerId, peerId, outsiderId, teamUserId, viewerId] = userIds;
const spaceId = `${prefix}-space`;
const pageId = `${prefix}-page`;
const teamId = `${prefix}-team`;
const clients: Client[] = [];

type Client = { document: Y.Doc; provider: HocuspocusProvider; socket: HocuspocusProviderWebsocket; rejected: boolean; destroy: () => void };
const pause = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
async function until(check: () => boolean | Promise<boolean>, label: string, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await pause(80); }
  throw new Error(`Timed out: ${label}`);
}
async function token(userId: string, readOnly = false, shareId?: string) {
  return new SignJWT({ pageId, name: "Live Collab QA", readOnly, ...(shareId ? { shareId } : {}) }).setProtectedHeader({ alg: "HS256" })
    .setSubject(userId).setIssuer("atlas-web").setAudience("atlas-collaboration")
    .setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode(secret));
}
async function connect(userId: string, options: { readOnly?: boolean; signedToken?: string } = {}) {
  const signedToken = options.signedToken || await token(userId, options.readOnly);
  const document = new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${collabPort}`, WebSocketPolyfill: WebSocket,
    autoConnect: false, maxAttempts: 1, delay: 100, minDelay: 100, maxDelay: 100 });
  let rejected = false;
  const provider = new HocuspocusProvider({ websocketProvider: socket, name: `page:${pageId}`, document, token: signedToken,
    onAuthenticationFailed: () => { rejected = true; }, onClose: () => { rejected = true; } });
  const client: Client = { document, provider, socket, get rejected() { return rejected; }, set rejected(value) { rejected = value; },
    destroy: () => { provider.destroy(); socket.destroy(); document.destroy(); } };
  clients.push(client);
  provider.attach();
  void socket.connect();
  await until(() => provider.isSynced || rejected, "provider initial synchronization");
  assert(provider.isSynced && !rejected, "Authorized fixture provider must synchronize.");
  return client;
}
function task(client: Client, taskId: string) { return readTodoTasks(client.document).find((item) => item.id === taskId)!; }
function rawTask(client: Client, taskId: string) { return (client.document.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<Y.Map<unknown>>).get(taskId)!; }
async function indexTask(taskId: string) { return prisma.todoTaskIndex.findUniqueOrThrow({ where: { pageId_taskId: { pageId, taskId } } }); }
async function expectRejectedMutation(client: Client, taskId: string, change: () => void, originalTitle: string) {
  change();
  await until(() => client.rejected, "unauthorized or invalid synchronization rejected");
  client.destroy();
  await pause(2300); // Longer than the store debounce: a rejected update must never reach SQL.
  assert.equal((await indexTask(taskId)).title, originalTitle);
}

async function main() {
  const health = await fetch(`http://127.0.0.1:${collabPort}/health`);
  assert(health.ok, "QA collaboration service must be running.");
  await prisma.user.createMany({ data: userIds.map((id) => ({ id, email: `${id}@example.invalid`, active: true })) });
  await prisma.space.create({ data: { id: spaceId, slug: prefix, name: "Live Collab QA" } });
  await prisma.membership.createMany({ data: [
    { userId: writerId, spaceId, role: "EDITOR" }, { userId: peerId, spaceId, role: "EDITOR" }, { userId: viewerId, spaceId, role: "VIEWER" },
  ] });
  await prisma.team.create({ data: { id: teamId, name: prefix } });
  await prisma.teamMember.create({ data: { userId: teamUserId, teamId, expiresAt: new Date(Date.now() + 60_000) } });
  await prisma.spaceTeamAccess.create({ data: { teamId, spaceId, role: "EDITOR" } });
  const initial = new Y.Doc(); initializeTodoBoard(initial);
  const blockerId = addTodoTask(initial, { title: "Prerequisite", assigneeIds: [writerId] })!;
  const taskId = addTodoTask(initial, { title: "Target", blockedBy: [blockerId], deadline: "2026-10-15", assigneeIds: [writerId] })!;
  const initialState = Y.encodeStateAsUpdate(initial); initial.destroy();
  await prisma.$transaction(async (transaction) => {
    await transaction.page.create({ data: { id: pageId, spaceId, slug: "board", title: "Live Collab QA", format: "TODO", createdById: writerId } });
    await transaction.collabDocument.create({ data: { name: `page:${pageId}`, data: Buffer.from(initialState) } });
    await replaceTodoIndex(transaction, { id: pageId, spaceId }, initialState);
  });
  const a = await connect(writerId);
  const b = await connect(peerId);
  updateTodoTask(a.document, taskId, { deadline: "2026-10-20" });
  updateTodoTask(b.document, taskId, { description: "A separate simultaneous edit" });
  await until(() => task(a, taskId).description === "A separate simultaneous edit" && task(b, taskId).deadline === "2026-10-20", "two clients converge on independent changes");
  await until(async () => (await indexTask(taskId)).stateHash === todoTaskStateHash(task(a, taskId)), "SQL index matches the converged task");
  const durable = decodeTodoTasks((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${pageId}` } })).data).find((item) => item.id === taskId)!;
  assert.equal(todoTaskStateHash(durable), (await indexTask(taskId)).stateHash);
  console.log("PASS two live clients merge concurrent fields; durable Yjs and SQL index match");

  const raceLeft = addTodoTask(a.document, { title: "Concurrent dependency left" })!;
  const raceRight = addTodoTask(a.document, { title: "Concurrent dependency right" })!;
  await until(() => Boolean(task(b, raceLeft) && task(b, raceRight)), "concurrent dependency fixtures synchronized");
  a.document.transact(() => { rawTask(a, raceLeft).set("blockedBy", [raceRight]); rawTask(a, raceLeft).set("assigneeIds", [viewerId]); });
  b.document.transact(() => { rawTask(b, raceRight).set("blockedBy", [raceLeft]); rawTask(b, raceRight).set("assigneeIds", [viewerId]); });
  await pause(200);
  const dependencyObserver = await connect(viewerId);
  const liveCycle = task(dependencyObserver, raceLeft).blockedBy.includes(raceRight) && task(dependencyObserver, raceRight).blockedBy.includes(raceLeft);
  dependencyObserver.destroy();
  assert.equal(liveCycle, false, "Concurrent dependency changes during async assignment checks must not create a cycle in the live server document.");
  // A rejected client's local optimistic branch remains dirty; reopen both before later cases.
  a.destroy(); b.destroy();
  const mainA = await connect(writerId);
  const mainB = await connect(peerId);
  console.log("PASS concurrent dependency/assignment updates cannot bypass live completion rules");

  updateTodoTask(mainA.document, taskId, { deadline: null });
  await until(async () => (await indexTask(taskId)).deadline === null, "deadline removal persisted");
  const forbiddenCompletion = await connect(writerId);
  rawTask(forbiddenCompletion, taskId).set("column", "COMPLETED");
  await until(() => forbiddenCompletion.rejected, "server rejects completion bypass");
  forbiddenCompletion.destroy();
  assert.equal((await indexTask(taskId)).column, "NEW");
  assert.equal(updateTodoTask(mainA.document, blockerId, { column: "COMPLETED" }), true);
  await until(() => task(mainB, blockerId).column === "COMPLETED", "prerequisite completion converges");
  assert.equal(updateTodoTask(mainB.document, taskId, { column: "COMPLETED" }), true);
  await until(async () => (await indexTask(taskId)).column === "COMPLETED", "valid dependent completion persisted");
  console.log("PASS due date removal and live prerequisite completion enforcement");

  const staleTaskId = addTodoTask(mainA.document, { title: "Remove when restoring", assigneeIds: [writerId] })!;
  await until(async () => Boolean(await prisma.todoTaskIndex.findUnique({ where: { pageId_taskId: { pageId, taskId: staleTaskId } } })), "new temporary task indexed");
  assert.equal(deleteTodoTask(mainA.document, taskId), true);
  await until(async () => !(await prisma.todoTaskIndex.findUnique({ where: { pageId_taskId: { pageId, taskId } } })), "live deleted task removed from index");
  const snapshot = new Y.Doc(); Y.applyUpdate(snapshot, initialState);
  copyTodoBoard(snapshot, mainA.document); snapshot.destroy();
  await until(async () => {
    const restored = await prisma.todoTaskIndex.findUnique({ where: { pageId_taskId: { pageId, taskId } } });
    return restored?.deadline === "2026-10-15" && restored.column === "NEW";
  }, "live snapshot restoration reintroduces the task with its old deadline/status");
  await until(() => task(mainB, taskId)?.deadline === "2026-10-15", "second client receives restored task");
  assert.deepEqual((await indexTask(taskId)).assigneeIds, [writerId]);
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId, taskId: staleTaskId } }), 0);
  console.log("PASS live task deletion and snapshot restoration retain assignments and remove stale projected tasks");

  const invalidAssignee = await connect(writerId);
  rawTask(invalidAssignee, taskId).set("assigneeIds", [outsiderId]);
  await until(() => invalidAssignee.rejected, "foreign assignee rejected"); invalidAssignee.destroy();
  await pause(2300);
  assert.deepEqual((await indexTask(taskId)).assigneeIds, [writerId]);
  const staleAssignee = await connect(writerId);
  // Eligible at initial sync, revoked immediately before the assignment update.
  await prisma.membership.delete({ where: { userId_spaceId: { userId: peerId, spaceId } } });
  rawTask(staleAssignee, taskId).set("assigneeIds", [peerId]);
  await until(() => staleAssignee.rejected, "revoked assignee rejected"); staleAssignee.destroy();
  await pause(2300);
  assert.deepEqual((await indexTask(taskId)).assigneeIds, [writerId]);
  console.log("PASS foreign and freshly revoked assignee synchronization rejected");

  const viewer = await connect(viewerId); // Token claims write permission; live rights must narrow it.
  rawTask(viewer, taskId).set("title", "Viewer bypass");
  await pause(2300);
  assert.equal((await indexTask(taskId)).title, "Target"); viewer.destroy();
  const share = await prisma.pageShare.create({ data: { pageId, createdById: writerId, label: "Live QA public share",
    tokenHash: `${prefix}-share`, tokenPrefix: "qa", permission: "VIEW" } });
  const staleViewShare = await connect("public-qa", { signedToken: await token("public-qa", true, share.id) });
  await prisma.pageShare.update({ where: { id: share.id }, data: { permission: "EDIT" } });
  rawTask(staleViewShare, taskId).set("title", "Read-only public token bypass");
  await pause(2300);
  assert.equal((await indexTask(taskId)).title, "Target"); staleViewShare.destroy();
  const editShare = await connect("public-qa", { signedToken: await token("public-qa", false, share.id) });
  updateTodoTask(editShare.document, taskId, { description: "Fresh edit-share token works" });
  await until(async () => (await indexTask(taskId)).description === "Fresh edit-share token works", "fresh public edit token allowed"); editShare.destroy();
  console.log("PASS read-only public tokens stay read-only after a permission upgrade; fresh edit token works");
  const writerToken = await token(writerId);
  const retainedWriter = await connect(writerId, { signedToken: writerToken });
  await prisma.membership.delete({ where: { userId_spaceId: { userId: writerId, spaceId } } });
  await expectRejectedMutation(retainedWriter, taskId, () => rawTask(retainedWriter, taskId).set("title", "Revoked session bypass"), "Target");
  const retainedTeam = await connect(teamUserId, { signedToken: await token(teamUserId) });
  await prisma.teamMember.update({ where: { userId_teamId: { userId: teamUserId, teamId } }, data: { expiresAt: new Date(Date.now() - 1) } });
  await expectRejectedMutation(retainedTeam, taskId, () => rawTask(retainedTeam, taskId).set("title", "Expired team bypass"), "Target");
  console.log("PASS Viewer restrictions, live writer revocation and expired team retained-token updates blocked");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  for (const client of clients) { try { client.destroy(); } catch { /* Already closed clients are harmless. */ } }
  // Allow server disconnect hooks to finish, then delete only this run's fixture IDs.
  await pause(250);
  await prisma.page.deleteMany({ where: { id: pageId } });
  await prisma.collabDocument.deleteMany({ where: { name: `page:${pageId}` } });
  await prisma.space.deleteMany({ where: { id: spaceId } });
  await prisma.team.deleteMany({ where: { id: teamId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});
