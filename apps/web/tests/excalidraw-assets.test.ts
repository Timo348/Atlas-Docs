import assert from "node:assert/strict";
import test from "node:test";
import {
  configureExcalidrawAssets,
  EXCALIDRAW_ASSET_PATH,
} from "../src/lib/excalidraw-assets";

test("Excalidraw uses the same-origin self-hosted asset directory", () => {
  const target: { EXCALIDRAW_ASSET_PATH?: string } = {};

  configureExcalidrawAssets(target);

  assert.equal(EXCALIDRAW_ASSET_PATH, "/excalidraw-assets/");
  assert.equal(target.EXCALIDRAW_ASSET_PATH, "/excalidraw-assets/");
  assert.equal(new URL(target.EXCALIDRAW_ASSET_PATH, "https://atlas.intranet").origin, "https://atlas.intranet");
});
