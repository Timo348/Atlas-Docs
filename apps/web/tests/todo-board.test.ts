import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  addTodoTask,
  copyTodoBoard,
  initializeTodoBoard,
  readTodoTasks,
  serializeTodoBoard,
  todoDeadlineState,
  updateTodoTask,
} from "../src/lib/todo-board";

test("Todo tasks sort every column by descending priority, then nearest deadline", () => {
  const document = new Y.Doc();
  initializeTodoBoard(document);
  addTodoTask(document, { title: "Low", priority: "LOW", deadline: "2026-09-02" });
  addTodoTask(document, { title: "Urgent", priority: "URGENT", deadline: "2026-10-02" });
  addTodoTask(document, { title: "High late", priority: "HIGH", deadline: "2026-09-04" });
  addTodoTask(document, { title: "High early", priority: "HIGH", deadline: "2026-09-01" });

  assert.deepEqual(readTodoTasks(document).map((task) => task.title), ["Urgent", "High early", "High late", "Low"]);
  document.destroy();
});

test("Todo tasks preserve deadline, status, and portable JSON", () => {
  const document = new Y.Doc();
  initializeTodoBoard(document);
  const id = addTodoTask(document, { title: "Release", priority: "HIGH", deadline: "2026-08-21" });
  assert.ok(id);
  assert.equal(updateTodoTask(document, id!, { column: "IN_PROGRESS" }), true);
  const task = readTodoTasks(document)[0];

  assert.equal(task.column, "IN_PROGRESS");
  assert.equal(todoDeadlineState(task, new Date("2026-08-21T10:00:00")), "today");
  assert.equal(todoDeadlineState(task, new Date("2026-08-22T10:00:00")), "overdue");
  assert.deepEqual(JSON.parse(serializeTodoBoard(document)).tasks[0], task);
  document.destroy();
});

test("Todo board snapshots copy tasks independently", () => {
  const source = new Y.Doc();
  const target = new Y.Doc();
  initializeTodoBoard(source);
  addTodoTask(source, { title: "Plan", priority: "MEDIUM" });
  copyTodoBoard(source, target);
  addTodoTask(source, { title: "Later", priority: "LOW" });

  assert.deepEqual(readTodoTasks(target).map((task) => task.title), ["Plan"]);
  source.destroy();
  target.destroy();
});
