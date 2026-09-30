import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import {
  TODO_BOARD_MAP, TodoBoardDecodeError, addTodoTask, copyTodoBoard, createTodoBoardStateFromJson, decodeTodoTasks,
  deleteTodoTask, initializeTodoBoard, mergeTodoBoardStates, readTodoTasks, serializeTodoBoard, updateTodoTask,
} from "./index.js";
import { replaceTodoIndex, todoIndexRows, todoTaskStateHash, type TodoIndexRow, type TodoIndexTransaction } from "./persistence.js";

test("legacy tasks remain unassigned and assignments survive snapshots and export", () => {
  const source = new Y.Doc();
  const target = new Y.Doc();
  initializeTodoBoard(source);
  const id = addTodoTask(source, { title: "Old task" })!;
  assert.deepEqual(readTodoTasks(source)[0].assigneeIds, []);
  assert.equal(updateTodoTask(source, id, { assigneeIds: ["b", "a", "a"] }), true);
  copyTodoBoard(source, target);
  assert.deepEqual(readTodoTasks(target)[0].assigneeIds, ["a", "b"]);
  assert.deepEqual(JSON.parse(serializeTodoBoard(target)).tasks[0].assigneeIds, ["a", "b"]);
  source.destroy(); target.destroy();
});

test("damaged Yjs and structurally damaged records fail visibly without changing source bytes", () => {
  assert.throws(() => decodeTodoTasks(new Uint8Array([255, 255, 255])), TodoBoardDecodeError);
  const document = new Y.Doc();
  initializeTodoBoard(document);
  (document.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<unknown>).set("broken", "not a map");
  const before = Y.encodeStateAsUpdate(document);
  assert.throws(() => decodeTodoTasks(before), /Unreadable Todo task broken/);
  assert.deepEqual(Y.encodeStateAsUpdate(document), before);
  document.destroy();
});

test("empty and uninitialized boards project to an indexed empty board", async () => {
  const calls: string[] = [];
  const transaction: TodoIndexTransaction = {
    todoTaskIndex: { deleteMany: async () => { calls.push("delete"); }, createMany: async () => { calls.push("create"); } },
    page: { update: async ({ data }) => { calls.push(data.todoIndexState); } },
  };
  await replaceTodoIndex(transaction, { id: "p", spaceId: "s" }, null);
  assert.deepEqual(calls, ["delete", "INDEXED"]);
});

test("index replaces removed tasks and changed date/assignment state; task identity includes page", async () => {
  const document = new Y.Doc();
  const first = addTodoTask(document, { title: "First", deadline: "2026-10-03", assigneeIds: ["a"] })!;
  const second = addTodoTask(document, { title: "Second" })!;
  let rows: TodoIndexRow[] = [];
  const transaction: TodoIndexTransaction = {
    todoTaskIndex: { deleteMany: async () => { rows = []; }, createMany: async ({ data }) => { rows = data; } },
    page: { update: async () => undefined },
  };
  await replaceTodoIndex(transaction, { id: "board-1", spaceId: "space" }, Y.encodeStateAsUpdate(document));
  const hash = rows.find((row) => row.taskId === first)!.stateHash;
  deleteTodoTask(document, second);
  updateTodoTask(document, first, { deadline: null, column: "COMPLETED", assigneeIds: ["b"] });
  await replaceTodoIndex(transaction, { id: "board-1", spaceId: "space" }, Y.encodeStateAsUpdate(document));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deadline, null);
  assert.equal(rows[0].column, "COMPLETED");
  assert.deepEqual(rows[0].assigneeIds, ["b"]);
  assert.notEqual(rows[0].stateHash, hash);
  assert.equal(todoIndexRows({ id: "board-2", spaceId: "space" }, readTodoTasks(document))[0].pageId, "board-2");
  document.destroy();
});

test("corruption is detected before any projection mutations", async () => {
  let touched = false;
  const transaction: TodoIndexTransaction = {
    todoTaskIndex: { deleteMany: async () => { touched = true; }, createMany: async () => { touched = true; } },
    page: { update: async () => { touched = true; } },
  };
  await assert.rejects(replaceTodoIndex(transaction, { id: "p", spaceId: "s" }, new Uint8Array([255])), TodoBoardDecodeError);
  assert.equal(touched, false);
});

test("task hashes ignore assignment/dependency ordering while retaining all mutable fields", () => {
  const document = new Y.Doc();
  addTodoTask(document, { title: "task", assigneeIds: ["a", "b"] });
  const task = readTodoTasks(document)[0];
  assert.equal(todoTaskStateHash(task), todoTaskStateHash({ ...task, assigneeIds: ["b", "a"] }));
  assert.notEqual(todoTaskStateHash(task), todoTaskStateHash({ ...task, deadline: "2026-10-01" }));
  document.destroy();
});

test("late snapshots retain concurrent updates and deletion tombstones", () => {
  const first = new Y.Doc();
  const id = addTodoTask(first, { title: "shared" })!;
  const second = new Y.Doc();
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  updateTodoTask(first, id, { deadline: "2026-10-10" });
  updateTodoTask(second, id, { description: "independent change" });
  const merged = mergeTodoBoardStates(Y.encodeStateAsUpdate(first), Y.encodeStateAsUpdate(second));
  assert.equal(decodeTodoTasks(merged)[0].deadline, "2026-10-10");
  assert.equal(decodeTodoTasks(merged)[0].description, "independent change");
  deleteTodoTask(first, id);
  assert.deepEqual(decodeTodoTasks(mergeTodoBoardStates(Y.encodeStateAsUpdate(first), merged)), []);
  first.destroy(); second.destroy();
});

test("durable snapshot merge rejects concurrent dependency cycles before persistence", () => {
  const first = new Y.Doc();
  const a = addTodoTask(first, { title: "A" })!;
  const b = addTodoTask(first, { title: "B" })!;
  const second = new Y.Doc();
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  updateTodoTask(first, a, { blockedBy: [b] });
  updateTodoTask(second, b, { blockedBy: [a] });
  assert.throws(() => mergeTodoBoardStates(Y.encodeStateAsUpdate(first), Y.encodeStateAsUpdate(second)), /dependency cycle/);
  first.destroy(); second.destroy();
});

test("portable Todo import preserves IDs, dependencies, assignment and timestamps", () => {
  const document = new Y.Doc();
  const first = addTodoTask(document, { title: "Prerequisite", assigneeIds: ["alice", "bob"] })!;
  addTodoTask(document, { title: "Follow-up", blockedBy: [first], deadline: "2026-10-15" });
  assert.deepEqual(decodeTodoTasks(createTodoBoardStateFromJson(serializeTodoBoard(document))), readTodoTasks(document));
  document.destroy();
});

test("portable Todo import rejects lost dependencies, cycles and invalid completion", () => {
  const task = { id: "a", title: "Task A", description: "", column: "NEW", priority: "MEDIUM", deadline: null, blockedBy: [], assigneeIds: ["alice"], createdAt: 1, updatedAt: 1 };
  const json = (tasks: unknown[]) => JSON.stringify({ format: "atlas-todos", version: 1, tasks });
  assert.throws(() => createTodoBoardStateFromJson(json([{ ...task, blockedBy: ["missing"] }])), /dependency/);
  assert.throws(() => createTodoBoardStateFromJson(json([{ ...task, blockedBy: ["b"] }, { ...task, id: "b", blockedBy: ["a"] }])), /cycle/);
  assert.throws(() => createTodoBoardStateFromJson(json([{ ...task, blockedBy: ["b"], column: "COMPLETED" }, { ...task, id: "b" }])), /unfinished/);
  assert.throws(() => createTodoBoardStateFromJson(json([task, task])), /duplicate/);
  assert.throws(() => createTodoBoardStateFromJson(json([{ ...task, assigneeIds: [5] }])), /assigneeIds/);
});
