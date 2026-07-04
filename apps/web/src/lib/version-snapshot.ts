import * as Y from "yjs";

const MAP_NAMES = ["canvas-elements", "canvas-files", "canvas-settings"] as const;

export function createVisibleSnapshot(source: Y.Doc) {
  const snapshot = new Y.Doc();
  const sourceText = source.getText("markdown").toString();
  if (sourceText) snapshot.getText("markdown").insert(0, sourceText);
  for (const name of MAP_NAMES) {
    const sourceMap = source.getMap<unknown>(name);
    const targetMap = snapshot.getMap<unknown>(name);
    for (const [key, value] of sourceMap.entries()) targetMap.set(key, clone(value));
  }
  const update = Y.encodeStateAsUpdate(snapshot);
  snapshot.destroy();
  return update;
}

export function restoreVisibleSnapshot(target: Y.Doc, update: Uint8Array) {
  const snapshot = new Y.Doc();
  Y.applyUpdate(snapshot, update);
  target.transact(() => {
    const targetText = target.getText("markdown");
    targetText.delete(0, targetText.length);
    const content = snapshot.getText("markdown").toString();
    if (content) targetText.insert(0, content);
    for (const name of MAP_NAMES) {
      const targetMap = target.getMap<unknown>(name);
      targetMap.clear();
      for (const [key, value] of snapshot.getMap<unknown>(name).entries()) {
        targetMap.set(key, clone(value));
      }
    }
  }, "version-restore");
  snapshot.destroy();
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
