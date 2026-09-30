import assert from "node:assert/strict";
import test from "node:test";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { CalendarSaveError, saveCalendarSpaceTask, todoUpdateMatches } from "../src/lib/calendar-collaboration";
import { addTodoTask, readTodoTasks, type TodoTask } from "../src/lib/todo-board";

test("calendar writes the original board and confirms normalized durable fields", { timeout: 15_000 }, async () => {
  const initialDocument = new Y.Doc();
  const dependencyId = addTodoTask(initialDocument, { title: "Prerequisite" })!;
  const id = addTodoTask(initialDocument, { title: "Calendar task", blockedBy: [dependencyId], assigneeIds: ["alice"] })!;
  const original = readTodoTasks(initialDocument).find((task) => task.id === id)!;
  let indexed: TodoTask = original;
  let stores = 0;
  const server = new Server({
    address: "127.0.0.1", port: 0, quiet: true, stopOnSignals: false, debounce: 15, maxDebounce: 50,
    async onAuthenticate() { return {}; },
    async onLoadDocument() { return Y.encodeStateAsUpdate(initialDocument); },
    async onStoreDocument({ document }) { indexed = readTodoTasks(document).find((task) => task.id === id)!; stores++; },
  });
  const originalFetch = globalThis.fetch;
  try {
    await server.listen();
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === "/api/runtime-config") return Response.json({ collaborationUrl: `ws://127.0.0.1:${server.address.port}` });
      if (url.startsWith("/api/collaboration-token")) return Response.json({ token: "test", readOnly: false });
      return Response.json({ task: indexed, revision: JSON.stringify(indexed), canEdit: true });
    };
    const result = await saveCalendarSpaceTask("original-board", original, { deadline: "2026-10-15", description: "  Draft with trailing newline\n", assigneeIds: ["bob", "alice"] });
    assert.ok(stores > 0, "save must wait for persisted indexing");
    assert.equal(result.description, "Draft with trailing newline");
    assert.equal(result.deadline, "2026-10-15");
    assert.deepEqual(result.blockedBy, [dependencyId], "calendar edits preserve dependency rules");
    assert.deepEqual(result.assigneeIds, ["alice", "bob"]);
    assert.equal(todoUpdateMatches(result, { assigneeIds: ["alice", "bob"] }), true);
    await assert.rejects(saveCalendarSpaceTask("original-board", result, { column: "COMPLETED" }), (failure: unknown) => failure instanceof CalendarSaveError && failure.reason === "dependency");
    await assert.rejects(saveCalendarSpaceTask("original-board", { ...result, title: "Stale title" }, { title: "Overwritten" }), (failure: unknown) => failure instanceof CalendarSaveError && failure.reason === "conflict");
  } finally {
    globalThis.fetch = originalFetch;
    await server.destroy();
    initialDocument.destroy();
  }
});

test("calendar refuses a read-only collaboration token before mutation", { timeout: 5000 }, async () => {
  const initialDocument = new Y.Doc();
  const id = addTodoTask(initialDocument, { title: "Protected" })!;
  const initial = readTodoTasks(initialDocument).find((task) => task.id === id)!;
  const server = new Server({ address: "127.0.0.1", port: 0, quiet: true, stopOnSignals: false });
  const originalFetch = globalThis.fetch;
  try {
    await server.listen();
    globalThis.fetch = async (input) => String(input) === "/api/runtime-config"
      ? Response.json({ collaborationUrl: `ws://127.0.0.1:${server.address.port}` })
      : Response.json({ token: "readonly", readOnly: true });
    await assert.rejects(saveCalendarSpaceTask("protected-board", initial, { title: "Forbidden" }), (failure: unknown) => failure instanceof CalendarSaveError && failure.reason === "permission");
  } finally {
    globalThis.fetch = originalFetch;
    await server.destroy();
    initialDocument.destroy();
  }
});
