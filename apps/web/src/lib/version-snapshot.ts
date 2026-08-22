import * as Y from "yjs";
import { copyTodoBoard } from "@/lib/todo-board";

const MAP_NAMES = ["canvas-elements", "canvas-files", "canvas-settings"] as const;
export type SnapshotFormat = "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";

export function createVisibleSnapshot(source: Y.Doc, format: SnapshotFormat) {
  const snapshot = new Y.Doc();
  if (format === "CANVAS") {
    for (const name of MAP_NAMES) {
      const sourceMap = source.getMap<unknown>(name);
      const targetMap = snapshot.getMap<unknown>(name);
      for (const [key, value] of sourceMap.entries()) targetMap.set(key, clone(value));
    }
  } else if (format === "TODO") {
    copyTodoBoard(source, snapshot);
  } else {
    const sourceText = source.getText("markdown").toString();
    if (sourceText) snapshot.getText("markdown").insert(0, sourceText);
  }
  const update = Y.encodeStateAsUpdate(snapshot);
  snapshot.destroy();
  return update;
}

export function restoreVisibleSnapshot(target: Y.Doc, update: Uint8Array, format: SnapshotFormat) {
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, update);
  target.transact(() => {
    if (format === "CANVAS") {
      for (const name of MAP_NAMES) {
        const targetMap = target.getMap<unknown>(name);
        targetMap.clear();
        for (const [key, value] of snapshot.getMap<unknown>(name).entries()) {
          targetMap.set(key, clone(value));
        }
      }
    } else if (format === "TODO") {
      copyTodoBoard(snapshot, target);
    } else {
      const targetText = target.getText("markdown");
      targetText.delete(0, targetText.length);
      const content = snapshot.getText("markdown").toString();
      if (content) targetText.insert(0, content);
    }
  }, "version-restore");
  snapshot.destroy();
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
