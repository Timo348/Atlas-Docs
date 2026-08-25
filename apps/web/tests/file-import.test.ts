import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { CodedApiError } from "../src/lib/api-errors";
import { readImportedFile, readValidatedPdf } from "../src/lib/file-import";
import { fileContentDisposition } from "../src/lib/file-response";
import { sharedPageAttachmentUrl } from "../src/lib/shared-page-attachments";
import { uploadLimitBytes, uploadLimitMb } from "../src/lib/upload-limit";

test("upload limits use configured whole megabytes and fall back safely", () => {
  assert.equal(uploadLimitMb(undefined), 25);
  assert.equal(uploadLimitMb("64"), 64);
  assert.equal(uploadLimitBytes("2"), 2 * 1024 * 1024);
  assert.equal(uploadLimitMb("0"), 25);
  assert.equal(uploadLimitMb("1.5"), 25);
  assert.equal(uploadLimitMb("not-a-number"), 25);
  assert.equal(uploadLimitMb("1025"), 25);
});

test("imports UTF-8 Markdown and LaTeX into editable Yjs text", async () => {
  const markdown = await readImportedFile(new File(["# Über Atlas\n"], "notes.md"));
  const latex = await readImportedFile(new File(["\\section{Atlas}\n"], "paper.tex"));
  assert.equal(markdown.format, "MARKDOWN");
  assert.equal(latex.format, "LATEX");
  if (markdown.format === "PDF" || latex.format === "PDF") assert.fail("unexpected PDF import");
  assert.equal(decodeText(markdown.collaborationState), "# Über Atlas\n");
  assert.equal(decodeText(latex.collaborationState), "\\section{Atlas}\n");
});

test("imports standard Excalidraw elements, files, and background", async () => {
  const source = JSON.stringify({
    type: "excalidraw",
    version: 2,
    elements: [{ id: "shape-1", type: "rectangle", isDeleted: false }],
    files: { "file-1": { id: "file-1", mimeType: "image/png" } },
    appState: { viewBackgroundColor: "#ffffff" },
  });
  const imported = await readImportedFile(new File([source], "diagram.excalidraw"));
  assert.equal(imported.format, "CANVAS");
  if (imported.format !== "CANVAS") assert.fail("unexpected import format");
  const document = decodeDocument(imported.collaborationState);
  try {
    assert.deepEqual(document.getMap("canvas-elements").get("shape-1"), { id: "shape-1", type: "rectangle", isDeleted: false });
    assert.equal(document.getMap("canvas-settings").get("viewBackgroundColor"), "#ffffff");
    assert.deepEqual(document.getMap("canvas-files").get("file-1"), { id: "file-1", mimeType: "image/png" });
  } finally {
    document.destroy();
  }
});

test("accepts structurally recognizable PDFs and rejects fake content", async () => {
  const valid = new File(["%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"], "specification.pdf", { type: "text/plain" });
  const imported = await readImportedFile(valid);
  assert.equal(imported.format, "PDF");
  assert.equal(imported.name, "specification.pdf");
  assert.equal((await readValidatedPdf(valid)).mime, "application/pdf");

  await assert.rejects(
    () => readValidatedPdf(new File(["not a PDF"], "fake.pdf", { type: "application/pdf" })),
    (error: unknown) => error instanceof CodedApiError && error.code === "FILE_INVALID_CONTENT",
  );
  await assert.rejects(
    () => readImportedFile(new File(["text"], "notes.txt")),
    (error: unknown) => error instanceof CodedApiError && error.code === "FILE_INVALID_TYPE",
  );
});

test("attachment links rewrite only for their shared page and filenames are safe", () => {
  assert.equal(
    sharedPageAttachmentUrl("/api/pages/page-1/attachments/asset-2?download=1", "page-1", { kind: "page", token: "secret/token", permission: "VIEW" }),
    "/api/public/shares/secret%2Ftoken/attachments/asset-2?download=1",
  );
  assert.equal(
    sharedPageAttachmentUrl("/api/pages/other/attachments/asset-2", "page-1", { kind: "page", token: "token", permission: "VIEW" }),
    "/api/pages/other/attachments/asset-2",
  );
  const disposition = fileContentDisposition("Überblick 2026.pdf", "attachment");
  assert.match(disposition, /^attachment; filename="_berblick 2026\.pdf";/);
  assert.match(disposition, /filename\*=UTF-8''%C3%9Cberblick%202026\.pdf$/);
});

function decodeText(update: Uint8Array) {
  const document = decodeDocument(update);
  try {
    return document.getText("markdown").toString();
  } finally {
    document.destroy();
  }
}

function decodeDocument(update: Uint8Array) {
  const document = new Y.Doc();
  Y.applyUpdate(document, update);
  return document;
}
