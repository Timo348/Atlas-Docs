import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { filePreviewKind } from "../src/lib/file-preview";

test("classifies browser-native file previews by MIME type", () => {
  assert.equal(filePreviewKind("application/pdf"), "pdf");
  assert.equal(filePreviewKind("application/pdf; charset=binary"), "pdf");
  assert.equal(filePreviewKind("image/png"), "image");
  assert.equal(filePreviewKind("image/svg+xml"), "image");
  assert.equal(filePreviewKind("audio/mpeg"), "audio");
  assert.equal(filePreviewKind("video/mp4"), "video");
});

test("keeps non-browser document formats as download-only files", () => {
  assert.equal(filePreviewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), null);
  assert.equal(filePreviewKind("application/octet-stream"), null);
  assert.equal(filePreviewKind(null), null);
});

test("file endpoints only serve classified previews inline", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  for (const route of [
    "app/api/pages/[id]/file/route.ts",
    "app/api/public/shares/[token]/file/route.ts",
  ]) {
    const routeSource = source(route);
    assert.match(routeSource, /new URL\(request\.url\).*filePreviewKind\(page\.fileMime\)/);
    assert.match(routeSource, /preview \? "inline" : "attachment"/);
    assert.match(routeSource, /Content-Security-Policy/);
  }
});
