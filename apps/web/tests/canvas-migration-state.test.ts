import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  CanvasStateDecodeError,
  DEFAULT_CANVAS_BACKGROUND,
  extractCanvasState,
} from "../../../prisma/canvas-migration-state";

function encodedDocument(configure: (document: Y.Doc) => void) {
  const document = new Y.Doc();
  configure(document);
  const state = Y.encodeStateAsUpdate(document);
  document.destroy();
  return state;
}

test("default canvas settings do not create a migrated canvas", () => {
  const extracted = extractCanvasState(encodedDocument((document) => {
    document.getText("markdown").insert(0, "# Page");
    document.getMap("canvas-settings").set("viewBackgroundColor", DEFAULT_CANVAS_BACKGROUND);
  }));
  assert.equal(extracted.hasContent, false);
});

test("visible elements and custom backgrounds count as canvas content", () => {
  const element = extractCanvasState(encodedDocument((document) => {
    document.getMap("canvas-elements").set("shape", { id: "shape", isDeleted: false });
  }));
  const background = extractCanvasState(encodedDocument((document) => {
    document.getMap("canvas-settings").set("viewBackgroundColor", "#ffffff");
  }));
  assert.equal(element.hasContent, true);
  assert.equal(background.hasContent, true);
});

test("migration copies every canvas map but no page text", () => {
  const extracted = extractCanvasState(encodedDocument((document) => {
    document.getText("markdown").insert(0, "legacy text");
    document.getMap("canvas-elements").set("shape", { id: "shape", isDeleted: false });
    document.getMap("canvas-files").set("image", { id: "image", dataURL: "data:image/png;base64,AA==" });
    document.getMap("canvas-settings").set("viewBackgroundColor", "#eeeeee");
  }));
  const target = new Y.Doc();
  Y.applyUpdate(target, extracted.state);
  assert.equal(target.getText("markdown").toString(), "");
  assert.deepEqual(target.getMap("canvas-elements").get("shape"), { id: "shape", isDeleted: false });
  assert.deepEqual(target.getMap("canvas-files").get("image"), { id: "image", dataURL: "data:image/png;base64,AA==" });
  assert.equal(target.getMap("canvas-settings").get("viewBackgroundColor"), "#eeeeee");
  target.destroy();
});

test("deleted elements and orphaned files alone do not create a canvas", () => {
  const extracted = extractCanvasState(encodedDocument((document) => {
    document.getMap("canvas-elements").set("shape", { id: "shape", isDeleted: true });
    document.getMap("canvas-files").set("image", { id: "image" });
  }));
  assert.equal(extracted.hasContent, false);
});

test("malformed Yjs data has a dedicated recoverable error type", () => {
  assert.throws(
    () => extractCanvasState(Uint8Array.of(255, 255, 255)),
    CanvasStateDecodeError,
  );
});
