import assert from "node:assert/strict";
import test from "node:test";
import {
  downloadableFileName,
  isGanttImportName,
  isMermaidImportName,
  isPlainTextImportName,
  portableExtension,
  safeDownloadName,
} from "../src/lib/page-file";

test("recognizes official plain-text imports", () => {
  assert.equal(isPlainTextImportName("notes.txt"), true);
  assert.equal(isPlainTextImportName("README"), true);
  assert.equal(isPlainTextImportName("archive"), true);
  assert.equal(isPlainTextImportName("settings.json"), false);
  assert.equal(isPlainTextImportName("picture.png"), false);
  assert.equal(isMermaidImportName("architecture.mmd"), true);
  assert.equal(isMermaidImportName("architecture.mermaid"), true);
  assert.equal(isMermaidImportName("architecture.txt"), false);
  assert.equal(isGanttImportName("roadmap.gantt"), true);
  assert.equal(isGanttImportName("roadmap.mmd"), false);
});

test("keeps text and unsupported-file names suitable for download and export", () => {
  assert.equal(downloadableFileName("notes.txt", "TEXT"), "notes.txt");
  assert.equal(downloadableFileName("README", "TEXT"), "README");
  assert.equal(downloadableFileName("overview", "MARKDOWN"), "overview.md");
  assert.equal(portableExtension("notes.txt", "TEXT"), ".txt");
  assert.equal(portableExtension("README", "TEXT"), "");
  assert.equal(portableExtension("archive.tar.gz", "FILE"), ".gz");
  assert.equal(downloadableFileName("architecture.mermaid", "MERMAID"), "architecture.mermaid");
  assert.equal(portableExtension("architecture.mermaid", "MERMAID"), ".mermaid");
  assert.equal(downloadableFileName("roadmap", "GANTT"), "roadmap.gantt");
  assert.equal(portableExtension("roadmap.gantt", "GANTT"), ".gantt");
  assert.equal(downloadableFileName("tasks", "TODO"), "tasks.todos.json");
  assert.equal(portableExtension("tasks", "TODO"), ".todos.json");
  assert.equal(safeDownloadName("unsafe\r\nname.txt"), "unsafe__name.txt");
});
