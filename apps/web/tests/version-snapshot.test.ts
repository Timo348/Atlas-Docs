import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { createVisibleSnapshot, restoreVisibleSnapshot } from "../src/lib/version-snapshot";

test("a text page snapshot restores text without carrying legacy canvas state", () => {
  const document = new Y.Doc();
  document.getText("markdown").insert(0, "Version eins");
  document.getMap("canvas-elements").set("shape", { id: "shape", x: 10 });
  const snapshot = createVisibleSnapshot(document, "MARKDOWN");

  document.getText("markdown").delete(0, document.getText("markdown").length);
  document.getText("markdown").insert(0, "Version zwei");
  document.getMap("canvas-elements").set("shape", { id: "shape", x: 99 });
  document.getMap("canvas-files").set("image", { id: "image" });

  restoreVisibleSnapshot(document, snapshot, "MARKDOWN");

  assert.equal(document.getText("markdown").toString(), "Version eins");
  assert.deepEqual(document.getMap("canvas-elements").get("shape"), { id: "shape", x: 99 });
  assert.equal(document.getMap("canvas-files").size, 1);
  document.destroy();
});

test("a canvas snapshot restores canvas state without carrying text", () => {
  const document = new Y.Doc();
  document.getText("markdown").insert(0, "legacy text");
  document.getMap("canvas-elements").set("shape", { id: "shape", x: 10 });
  const snapshot = createVisibleSnapshot(document, "CANVAS");

  document.getText("markdown").delete(0, document.getText("markdown").length);
  document.getText("markdown").insert(0, "keep this text untouched");
  document.getMap("canvas-elements").set("shape", { id: "shape", x: 99 });
  document.getMap("canvas-files").set("image", { id: "image" });

  restoreVisibleSnapshot(document, snapshot, "CANVAS");

  assert.equal(document.getText("markdown").toString(), "keep this text untouched");
  assert.deepEqual(document.getMap("canvas-elements").get("shape"), { id: "shape", x: 10 });
  assert.equal(document.getMap("canvas-files").size, 0);
  document.destroy();
});
