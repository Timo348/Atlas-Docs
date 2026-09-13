import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import {
  addTodoTask,
  canCompleteTodoTask,
  copyTodoBoard,
  deleteTodoTask,
  filterTodoDependencyCandidates,
  initializeTodoBoard,
  readTodoTasks,
  serializeTodoBoard,
  setTodoChecklistItemChecked,
  todoTaskBlockers,
  todoDeadlineState,
  updateTodoTask,
  wouldCreateTodoDependency,
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

test("Todo checklist items toggle their matching Markdown entry", () => {
  const description = "- [ ] First step\n  - [x] Nested step\n1. [ ] Final step\n";

  assert.equal(setTodoChecklistItemChecked(description, 1, false), "- [ ] First step\n  - [ ] Nested step\n1. [ ] Final step\n");
  assert.equal(setTodoChecklistItemChecked(description, 2, true), "- [ ] First step\n  - [x] Nested step\n1. [x] Final step\n");
  assert.equal(setTodoChecklistItemChecked(description, -1, true), description);
});

test("GFM checklist inputs render in the same order as their Markdown entries", () => {
  const description = "- [ ] First step\n  - [x] Nested step\n";
  let nextChecklistItemIndex = 0;
  const indexes: number[] = [];

  renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm],
    components: {
      input: ({ type, ...props }) => {
        if (type === "checkbox") indexes.push(nextChecklistItemIndex++);
        return createElement("input", props);
      },
    },
  }, description));

  assert.deepEqual(indexes, [0, 1]);
});

test("Todo tasks cannot be completed before their prerequisites", () => {
  const document = new Y.Doc();
  initializeTodoBoard(document);
  const specificationId = addTodoTask(document, { title: "Specification" });
  assert.ok(specificationId);
  const releaseId = addTodoTask(document, { title: "Release", blockedBy: [specificationId] });
  assert.ok(releaseId);

  assert.deepEqual(todoTaskBlockers(document, releaseId), [readTodoTasks(document).find((task) => task.id === specificationId)]);
  assert.equal(canCompleteTodoTask(document, releaseId), false);
  assert.equal(updateTodoTask(document, releaseId, { column: "COMPLETED" }), false);
  assert.equal(updateTodoTask(document, specificationId, { column: "COMPLETED" }), true);
  assert.equal(canCompleteTodoTask(document, releaseId), true);
  assert.equal(updateTodoTask(document, releaseId, { column: "COMPLETED" }), true);
  document.destroy();
});

test("Todo dependencies reject cycles and are cleaned up when a task is deleted", () => {
  const document = new Y.Doc();
  initializeTodoBoard(document);
  const planId = addTodoTask(document, { title: "Plan" });
  const reviewId = addTodoTask(document, { title: "Review" });
  assert.ok(planId && reviewId);

  assert.equal(updateTodoTask(document, planId, { blockedBy: [reviewId] }), true);
  assert.equal(wouldCreateTodoDependency(document, reviewId, planId), true);
  assert.equal(updateTodoTask(document, reviewId, { blockedBy: [planId] }), false);
  assert.equal(deleteTodoTask(document, reviewId), true);
  assert.deepEqual(readTodoTasks(document).find((task) => task.id === planId)?.blockedBy, []);
  document.destroy();
});

test("Todo dependency candidates support title search and hiding completed tasks", () => {
  const tasks = [
    { id: "one", title: "Prepare specification", column: "NEW", priority: "MEDIUM", deadline: null, blockedBy: [], description: "", createdAt: 1, updatedAt: 1 },
    { id: "two", title: "Review specification", column: "COMPLETED", priority: "LOW", deadline: null, blockedBy: [], description: "", createdAt: 2, updatedAt: 2 },
  ] as const;

  assert.deepEqual(filterTodoDependencyCandidates(tasks, "spec", true).map((task) => task.id), ["one"]);
  assert.deepEqual(filterTodoDependencyCandidates(tasks, "review", true, ["two"]).map((task) => task.id), ["two"]);
  assert.deepEqual(filterTodoDependencyCandidates(tasks, "prepare").map((task) => task.id), ["one"]);
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
  assert.deepEqual(readTodoTasks(document)[0]?.blockedBy, []);
  document.destroy();
});
