import * as Y from "yjs";
import { readTodoTasksForIndex, validateTodoTaskChanges } from "@atlas/todo";

/** Validate a merged preview without applying malformed client data to the live document. */
export function previewTodoSync(document: Y.Doc, payload: Uint8Array) {
  const preview = new Y.Doc();
  try {
    Y.applyUpdate(preview, Y.encodeStateAsUpdate(document));
    Y.applyUpdate(preview, payload);
    const before = new Map(readTodoTasksForIndex(document).map((task) => [task.id, task]));
    const after = readTodoTasksForIndex(preview);
    validateTodoTaskChanges([...before.values()], after);
    return {
      tasks: after,
      newlyAssigned: [...new Set(after.flatMap((task) => task.assigneeIds.filter((id) => !before.get(task.id)?.assigneeIds.includes(id))))],
    };
  } finally {
    preview.destroy();
  }
}
