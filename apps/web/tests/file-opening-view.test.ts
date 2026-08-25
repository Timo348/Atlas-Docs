import assert from "node:assert/strict";
import test from "node:test";
import { initialEditorTab } from "../src/lib/file-opening-view";
import { DEFAULT_PREFERENCES } from "../src/lib/preferences";

const preferences = {
  ...DEFAULT_PREFERENCES,
  fileViewDefaults: {
    markdown: "preview" as const,
    latex: "write" as const,
    mermaid: "diagram" as const,
    gantt: "source-and-diagram" as const,
  },
};

test("uses each configurable file type's own stored opening view", () => {
  assert.equal(initialEditorTab("MARKDOWN", preferences), "preview");
  assert.equal(initialEditorTab("LATEX", preferences), "write");
  assert.equal(initialEditorTab("MERMAID", preferences), "diagram");
});

test("keeps the only meaningful opening view for fixed file types", () => {
  assert.equal(initialEditorTab("CANVAS", preferences), "canvas");
  assert.equal(initialEditorTab("TODO", preferences), "todo");
  assert.equal(initialEditorTab("TEXT", preferences), "write");
  assert.equal(initialEditorTab("GANTT", preferences), "diagram");
});

test("keeps view-only Markdown and LaTeX shares reader-first", () => {
  assert.equal(initialEditorTab("MARKDOWN", preferences, "VIEW"), "preview");
  assert.equal(initialEditorTab("LATEX", preferences, "VIEW"), "preview");
});
