import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { TODO_BOARD_MAP, addTodoTask, readTodoTasks, updateTodoTask } from "@atlas/todo";
import { previewTodoSync } from "./todo-sync.js";

test("merged preview validates new assignees without modifying live concurrent board state", () => {
  const live = new Y.Doc();
  const id = addTodoTask(live, { title: "original", assigneeIds: ["a"] })!;
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(live));
  const vector = Y.encodeStateVector(client);
  updateTodoTask(client, id, { assigneeIds: ["a", "b"] });
  updateTodoTask(live, id, { deadline: "2026-10-10" });
  const result = previewTodoSync(live, Y.encodeStateAsUpdate(client, vector));
  assert.deepEqual(result.newlyAssigned, ["b"]);
  assert.equal(result.tasks[0].deadline, "2026-10-10");
  assert.deepEqual(readTodoTasks(live)[0].assigneeIds, ["a"]);
  live.destroy(); client.destroy();
});

test("a malformed incoming task never enters the live document", () => {
  const live = new Y.Doc();
  addTodoTask(live, { title: "valid" });
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(live));
  const vector = Y.encodeStateVector(client);
  (client.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<unknown>).set("invalid", "damaged");
  assert.throws(() => previewTodoSync(live, Y.encodeStateAsUpdate(client, vector)), /Unreadable Todo/);
  assert.equal(readTodoTasks(live).length, 1);
  live.destroy(); client.destroy();
});

test("concurrent dependency changes cannot create a cycle at the server", () => {
  const live = new Y.Doc();
  const a = addTodoTask(live, { title: "A" })!;
  const b = addTodoTask(live, { title: "B" })!;
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(live));
  const vector = Y.encodeStateVector(client);
  updateTodoTask(client, b, { blockedBy: [a] });
  updateTodoTask(live, a, { blockedBy: [b] });
  assert.throws(() => previewTodoSync(live, Y.encodeStateAsUpdate(client, vector)), /dependency cycle/);
  live.destroy(); client.destroy();
});

test("completion and new dependencies obey completion rules; unrelated edits preserve old stale completions", () => {
  const live = new Y.Doc();
  const blocker = addTodoTask(live, { title: "Blocker" })!;
  const dependent = addTodoTask(live, { title: "Dependent", blockedBy: [blocker] })!;
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(live));
  const vector = Y.encodeStateVector(client);
  const tasks = client.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<Y.Map<unknown>>;
  tasks.get(dependent)!.set("column", "COMPLETED");
  assert.throws(() => previewTodoSync(live, Y.encodeStateAsUpdate(client, vector)), /unfinished dependencies/);
  const liveTasks = live.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<Y.Map<unknown>>;
  liveTasks.get(dependent)!.set("column", "COMPLETED");
  const titleClient = new Y.Doc();
  Y.applyUpdate(titleClient, Y.encodeStateAsUpdate(live));
  const titleVector = Y.encodeStateVector(titleClient);
  (titleClient.getMap(TODO_BOARD_MAP).get("tasks") as Y.Map<Y.Map<unknown>>).get(dependent)!.set("title", "Renamed");
  assert.equal(previewTodoSync(live, Y.encodeStateAsUpdate(titleClient, titleVector)).tasks.find((task) => task.id === dependent)!.title, "Renamed");
  live.destroy(); client.destroy(); titleClient.destroy();
});
