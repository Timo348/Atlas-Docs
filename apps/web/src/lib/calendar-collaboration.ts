import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import { readTodoTasks, updateTodoTask, type TodoTask, type TodoTaskUpdate } from "@/lib/todo-board";

export class CalendarSaveError extends Error {
  constructor(public readonly reason: "permission" | "conflict" | "timeout" | "dependency" | "missing") { super(reason); }
}

export function todoUpdateMatches(task: TodoTask, update: TodoTaskUpdate) {
  return Object.entries(update).every(([key, value]) => {
    const actual = task[key as keyof TodoTask];
    return Array.isArray(value) && Array.isArray(actual)
      ? [...value].sort().join("\0") === [...actual].sort().join("\0")
      : value === actual;
  });
}

/** Connect to the original board, apply its completion rules, then wait for durable indexing. */
export async function saveCalendarSpaceTask(pageId: string, initial: TodoTask, update: TodoTaskUpdate) {
  const deadline = Date.now() + 30_000;
  const abort = new AbortController();
  const budgetTimer = setTimeout(() => abort.abort(), 30_000);
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  const document = new Y.Doc();
  let provider: HocuspocusProvider | undefined;
  try {
    const configuration = await fetch("/api/runtime-config", { signal: abort.signal });
    if (!configuration.ok) throw new CalendarSaveError("permission");
    const { collaborationUrl } = await configuration.json() as { collaborationUrl: string };
    await new Promise<void>((resolve, reject) => {
      syncTimer = setTimeout(() => reject(new CalendarSaveError("timeout")), Math.max(1, deadline - Date.now()));
      let writeAllowed = false;
      provider = new HocuspocusProvider({
        url: collaborationUrl,
        name: `page:${pageId}`,
        document,
        token: async () => {
          const response = await fetch(`/api/collaboration-token?pageId=${encodeURIComponent(pageId)}`, { cache: "no-store", signal: abort.signal });
          if (!response.ok) { clearTimeout(syncTimer); reject(new CalendarSaveError("permission")); throw new CalendarSaveError("permission"); }
          const access = await response.json() as { token: string; readOnly: boolean };
          writeAllowed = access.readOnly === false;
          if (!writeAllowed) { clearTimeout(syncTimer); reject(new CalendarSaveError("permission")); }
          return access.token;
        },
        onSynced: ({ state }) => { if (state) { clearTimeout(syncTimer); writeAllowed ? resolve() : reject(new CalendarSaveError("permission")); } },
        onAuthenticationFailed: () => { clearTimeout(syncTimer); reject(new CalendarSaveError("permission")); },
      });
    });
    // A fresh HTTP rights check closes the gap between connection and mutation.
    const stateResponse = await fetch(`/api/calendar/tasks/${encodeURIComponent(pageId)}/${encodeURIComponent(initial.id)}`, { cache: "no-store", signal: abort.signal });
    if (!stateResponse.ok) throw new CalendarSaveError(stateResponse.status === 404 ? "missing" : "permission");
    const persisted = await stateResponse.json() as { task: TodoTask; canEdit: boolean; revision: string };
    if (!persisted.canEdit) throw new CalendarSaveError("permission");
    const current = readTodoTasks(document).find((task) => task.id === initial.id);
    if (!current) throw new CalendarSaveError("missing");
    const originalFields = Object.fromEntries(Object.keys(update).map((key) => [key, initial[key as keyof TodoTask]])) as TodoTaskUpdate;
    if (!todoUpdateMatches(current, originalFields) || !todoUpdateMatches(persisted.task, originalFields)) throw new CalendarSaveError("conflict");
    if (!updateTodoTask(document, initial.id, update)) throw new CalendarSaveError("dependency");
    const expected = readTodoTasks(document).find((task) => task.id === initial.id)!;
    const acceptedUpdate = Object.fromEntries(Object.keys(update).map((key) => [key, expected[key as keyof TodoTask]])) as TodoTaskUpdate;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const response = await fetch(`/api/calendar/tasks/${encodeURIComponent(pageId)}/${encodeURIComponent(initial.id)}`, { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new CalendarSaveError(response.status === 404 ? "missing" : "permission");
      const indexed = await response.json() as { task: TodoTask; canEdit: boolean; revision: string };
      if (!indexed.canEdit) throw new CalendarSaveError("permission");
      if (indexed.revision !== persisted.revision) {
        if (todoUpdateMatches(indexed.task, acceptedUpdate)) return indexed.task;
        const conflictingField = Object.keys(acceptedUpdate).some((key) => !todoUpdateMatches(indexed.task, { [key]: initial[key as keyof TodoTask] }) && !todoUpdateMatches(indexed.task, { [key]: acceptedUpdate[key as keyof TodoTaskUpdate] }));
        if (conflictingField) throw new CalendarSaveError("conflict");
      }
    }
    throw new CalendarSaveError("timeout");
  } catch (failure) {
    if (abort.signal.aborted || (failure instanceof Error && failure.name === "AbortError")) throw new CalendarSaveError("timeout");
    throw failure;
  } finally {
    clearTimeout(syncTimer);
    clearTimeout(budgetTimer);
    abort.abort();
    provider?.destroy();
    document.destroy();
  }
}
