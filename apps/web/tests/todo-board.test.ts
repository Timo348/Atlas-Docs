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
  const id = addTodoTask(document, { title: "Release", description: "Ship the **release** notes.", priority: "HIGH", deadline: "2026-08-21" });
  assert.ok(id);
  assert.equal(updateTodoTask(document, id!, { column: "IN_PROGRESS", description: "Ship the **release** notes and verify images." }), true);
  const task = readTodoTasks(document)[0];

  assert.equal(task.column, "IN_PROGRESS");
  assert.equal(task.description, "Ship the **release** notes and verify images.");
  assert.equal(todoDeadlineState(task, new Date("2026-08-21T10:00:00")), "today");
  assert.equal(todoDeadlineState(task, new Date("2026-08-22T10:00:00")), "overdue");
  assert.deepEqual(JSON.parse(serializeTodoBoard(document)).tasks[0], task);
  document.destroy();
});

test("Todo board snapshots copy tasks independently", () => {
  const source = new Y.Doc();
  const target = new Y.Doc();
  initializeTodoBoard(source);
  addTodoTask(source, { title: "Plan", description: "Draft the **project plan**.", priority: "MEDIUM" });
  copyTodoBoard(source, target);
  addTodoTask(source, { title: "Later", priority: "LOW" });

  assert.deepEqual(readTodoTasks(target).map((task) => ({ title: task.title, description: task.description })), [{ title: "Plan", description: "Draft the **project plan**." }]);
  source.destroy();
  target.destroy();
});

test("Todo tasks created before descriptions default to an empty Markdown value", () => {
  const document = new Y.Doc();
  const board = document.getMap<unknown>("todo-board");
  const tasks = new Y.Map<unknown>();
  const task = new Y.Map<unknown>();
  task.set("title", "Legacy task");
  task.set("column", "NEW");
  task.set("priority", "MEDIUM");
  task.set("deadline", null);
  task.set("createdAt", 1);
  task.set("updatedAt", 1);
  tasks.set("legacy", task);
  board.set("version", 1);
  board.set("tasks", tasks);

  assert.equal(readTodoTasks(document)[0]?.description, "");
  document.destroy();
});
