import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import * as Y from "yjs";
import { addTodoTask, copyTodoBoard, decodeTodoTasks, deleteTodoTask, initializeTodoBoard, mergeTodoBoardStates, updateTodoTask } from "@atlas/todo";
import { replaceTodoIndex } from "@atlas/todo/persistence";

// Run against a disposable database only. All writes/deletes target the generated fixture IDs.
if (process.env.ATLAS_TEST_DATABASE !== "1") throw new Error("ATLAS_TEST_DATABASE=1 is required for the disposable integration database.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const prisma = new PrismaClient();
const prefix = `calendar-index-qa-${crypto.randomUUID()}`;
const pageIds: string[] = [];
const spaceIds: string[] = [];
const userId = `${prefix}-user`;

async function createBoard(spaceId: string, name: string, data?: Uint8Array) {
  const page = await prisma.page.create({ data: {
    id: `${prefix}-${name}`, title: name, slug: name, format: "TODO", spaceId, createdById: userId,
  } });
  pageIds.push(page.id);
  if (data) await prisma.collabDocument.create({ data: { name: `page:${page.id}`, data: Buffer.from(data) } });
  return page;
}

async function saveBoard(pageId: string, state: Uint8Array, rollback = false) {
  return prisma.$transaction(async (transaction) => {
    const pages = await transaction.$queryRaw<{ id: string; spaceId: string }[]>`
      SELECT "id", "spaceId" FROM "Page" WHERE "id" = ${pageId} FOR UPDATE
    `;
    const documents = await transaction.$queryRaw<{ data: Uint8Array }[]>`
      SELECT "data" FROM "CollabDocument" WHERE "name" = ${`page:${pageId}`} FOR UPDATE
    `;
    const merged = mergeTodoBoardStates(documents[0]?.data, state);
    await transaction.collabDocument.upsert({ where: { name: `page:${pageId}` },
      create: { name: `page:${pageId}`, data: Buffer.from(merged) }, update: { data: Buffer.from(merged) } });
    await replaceTodoIndex(transaction, pages[0], merged);
    if (rollback) throw new Error("intentional rollback");
  });
}

async function main() {
  await prisma.user.create({ data: { id: userId, email: `${prefix}@example.invalid`, name: "Todo index QA" } });
  const space = await prisma.space.create({ data: { id: `${prefix}-space`, name: "Todo index QA", slug: prefix } });
  spaceIds.push(space.id);
  const document = new Y.Doc();
  initializeTodoBoard(document);
  const taskId = addTodoTask(document, { title: "Legacy assigned", deadline: "2026-10-12", assigneeIds: [userId] })!;
  const legacy = await createBoard(space.id, "legacy", Y.encodeStateAsUpdate(document));
  const empty = await createBoard(space.id, "empty");
  const damagedBytes = new Uint8Array([1, 2, 3]);
  const damaged = await createBoard(space.id, "damaged", damagedBytes);
  assert.equal(empty.todoIndexState, "PENDING");
  const backfill = () => {
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/backfill-todo-index.ts"], { encoding: "utf8", env: process.env });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  };
  backfill();
  assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: empty.id } })).todoIndexState, "INDEXED");
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId: empty.id } }), 0);
  const damagedStatus = await prisma.page.findUniqueOrThrow({ where: { id: damaged.id } });
  assert.equal(damagedStatus.todoIndexState, "ERROR");
  assert.ok(damagedStatus.todoIndexError);
  assert.deepEqual(new Uint8Array((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${damaged.id}` } })).data), damagedBytes);
  const row = await prisma.todoTaskIndex.findUniqueOrThrow({ where: { pageId_taskId: { pageId: legacy.id, taskId } } });
  assert.deepEqual(row.assigneeIds, [userId]);
  const indexedAt = (await prisma.page.findUniqueOrThrow({ where: { id: legacy.id } })).todoIndexedAt;
  backfill();
  assert.equal((await prisma.page.findUniqueOrThrow({ where: { id: legacy.id } })).todoIndexedAt!.getTime(), indexedAt!.getTime());
  assert.deepEqual(new Uint8Array((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${damaged.id}` } })).data), damagedBytes);
  console.log("PASS backfill idempotency, empty/indexed distinction, damaged bytes and diagnostics");

  const original = new Uint8Array((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${legacy.id}` } })).data);
  updateTodoTask(document, taskId, { deadline: null, column: "COMPLETED" });
  await assert.rejects(saveBoard(legacy.id, Y.encodeStateAsUpdate(document), true), /intentional rollback/);
  assert.deepEqual(new Uint8Array((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${legacy.id}` } })).data), original);
  assert.equal((await prisma.todoTaskIndex.findUniqueOrThrow({ where: { pageId_taskId: { pageId: legacy.id, taskId } } })).deadline, "2026-10-12");
  await saveBoard(legacy.id, Y.encodeStateAsUpdate(document));
  const completed = await prisma.todoTaskIndex.findUniqueOrThrow({ where: { pageId_taskId: { pageId: legacy.id, taskId } } });
  assert.equal(completed.deadline, null); assert.equal(completed.column, "COMPLETED");
  assert.notEqual(completed.stateHash, row.stateHash);
  console.log("PASS atomic board/index rollback and date/completion update");

  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, original);
  const replacement = addTodoTask(document, { title: "Remove on restore" })!;
  await saveBoard(legacy.id, Y.encodeStateAsUpdate(document));
  copyTodoBoard(snapshot, document);
  await saveBoard(legacy.id, Y.encodeStateAsUpdate(document));
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId: legacy.id, taskId: replacement } }), 0);
  const restored = await prisma.todoTaskIndex.findUniqueOrThrow({ where: { pageId_taskId: { pageId: legacy.id, taskId } } });
  assert.deepEqual(restored.assigneeIds, [userId]); assert.equal(restored.deadline, "2026-10-12");
  const stored = decodeTodoTasks((await prisma.collabDocument.findUniqueOrThrow({ where: { name: `page:${legacy.id}` } })).data);
  assert.equal(stored.length, 1); assert.deepEqual(stored[0].assigneeIds, [userId]);
  deleteTodoTask(document, taskId);
  await saveBoard(legacy.id, Y.encodeStateAsUpdate(document));
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId: legacy.id } }), 0);
  console.log("PASS restored assignment/deadline retention and stale/deleted task cleanup");

  const cascadeDocument = new Y.Doc();
  addTodoTask(cascadeDocument, { title: "Cascade" });
  const pageCascade = await createBoard(space.id, "page-cascade");
  await saveBoard(pageCascade.id, Y.encodeStateAsUpdate(cascadeDocument));
  await prisma.page.delete({ where: { id: pageCascade.id } });
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId: pageCascade.id } }), 0);
  const cascadeSpace = await prisma.space.create({ data: { id: `${prefix}-cascade-space`, name: "Cascade Space", slug: `${prefix}-cascade` } });
  spaceIds.push(cascadeSpace.id);
  const spaceCascade = await createBoard(cascadeSpace.id, "space-cascade");
  await saveBoard(spaceCascade.id, Y.encodeStateAsUpdate(cascadeDocument));
  const cascadeRow = await prisma.todoTaskIndex.findFirstOrThrow({ where: { pageId: spaceCascade.id } });
  await assert.rejects(prisma.todoTaskIndex.update({
    where: { pageId_taskId: { pageId: cascadeRow.pageId, taskId: cascadeRow.taskId } }, data: { spaceId: space.id },
  }), (error: unknown) => error instanceof Error && "code" in error && error.code === "P2003", "Composite FK must reject an index row belonging to a different Space than its board.");
  await prisma.space.delete({ where: { id: cascadeSpace.id } });
  assert.equal(await prisma.todoTaskIndex.count({ where: { pageId: spaceCascade.id } }), 0);
  console.log("PASS Page and Space cascade cleanup and composite board/Space invariant");
  document.destroy(); snapshot.destroy(); cascadeDocument.destroy();
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.collabDocument.deleteMany({ where: { name: { in: pageIds.map((id) => `page:${id}`) } } });
  await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
  await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});
