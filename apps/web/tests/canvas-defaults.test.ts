import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CANVAS_ARROW_TYPE,
  DEFAULT_CANVAS_BACKGROUND_COLOR,
  getCanvasInitialAppState,
} from "../src/lib/canvas-defaults";

test("new canvas connections default to Excalidraw's fixed-anchor arrow type", () => {
  const appState = getCanvasInitialAppState(undefined);

  assert.equal(DEFAULT_CANVAS_ARROW_TYPE, "elbow");
  assert.equal(appState.currentItemArrowType, "elbow");
  assert.equal(appState.viewBackgroundColor, DEFAULT_CANVAS_BACKGROUND_COLOR);
});

test("the persisted canvas background is preserved", () => {
  assert.deepEqual(getCanvasInitialAppState("#102030"), {
    viewBackgroundColor: "#102030",
    currentItemArrowType: "elbow",
  });
});
