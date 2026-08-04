import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  buildPortableLayout,
  canUseExportScope,
  decodeCollaborationDocument,
  rewriteImageReferences,
  sanitizePathSegment,
} from "../src/lib/portable-backup";

test("portable paths are safe, nested, and collision resistant", () => {
  const layout = buildPortableLayout([{
    id: "space-1",
    name: "Operations",
    slug: "operations",
    folders: [
      { id: "folder-a", name: "Run Books", parentId: null, sortOrder: 0 },
      { id: "folder-b", name: "Run/Books", parentId: null, sortOrder: 1 },
      { id: "folder-c", name: "Linux", parentId: "folder-a", sortOrder: 0 },
    ],
    pages: [
      { id: "page-1", title: "Restore", slug: "restore", folderId: "folder-c", parentId: null, format: "MARKDOWN", sortOrder: 0 },
      { id: "page-2", title: "Formula", slug: "formula", folderId: null, parentId: null, format: "LATEX", sortOrder: 0 },
    ],
  }]);

  assert.equal(layout.pagePaths.get("page-1")?.sourcePath, "spaces/operations/run-books/linux/restore.md");
  assert.equal(layout.pagePaths.get("page-2")?.sourcePath, "spaces/operations/formula.tex");
  assert.notEqual(layout.folderPaths.get("folder-a"), layout.folderPaths.get("folder-b"));
  assert.equal(sanitizePathSegment("../../Überblick"), "uberblick");
  assert.equal(sanitizePathSegment("CON"), "con-item");
});

test("current Yjs text and canvas become portable content", () => {
  const document = new Y.Doc();
  document.getText("markdown").insert(0, "# Current");
  document.getMap("canvas-elements").set("shape", { id: "shape", type: "rectangle" });
  document.getMap("canvas-files").set("image", { id: "image", dataURL: "data:image/png;base64,AA==" });
  const decoded = decodeCollaborationDocument(Y.encodeStateAsUpdate(document));
  document.destroy();

  assert.equal(decoded.source, "# Current");
  assert.equal(decoded.canvas?.type, "excalidraw");
  assert.equal(decoded.canvas?.elements.length, 1);
  assert.ok(decoded.canvas?.files.image);
});

test("only available Atlas page images are rewritten and selected", () => {
  const result = rewriteImageReferences(
    "![one](/api/pages/page-1/images/image-1) ![missing](https://docs.example/api/pages/page-1/images/missing)",
    "page-1",
    "restore.assets",
    [{ id: "image-1", mime: "image/png" }],
  );
  assert.equal(result.source, "![one](./restore.assets/image-1.png) ![missing](https://docs.example/api/pages/page-1/images/missing)");
  assert.deepEqual(result.referencedImageIds, ["image-1"]);
});

test("instance exports are admin-only", () => {
  assert.equal(canUseExportScope("MEMBER", "accessible"), true);
  assert.equal(canUseExportScope("MEMBER", "instance"), false);
  assert.equal(canUseExportScope("ADMIN", "instance"), true);
});
