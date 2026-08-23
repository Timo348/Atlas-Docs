import assert from "node:assert/strict";
import test from "node:test";
import { mermaidViewForDefaultEditorView } from "../src/lib/mermaid-view";

test("uses the diagram-only Mermaid view for a preview default", () => {
  assert.equal(mermaidViewForDefaultEditorView("preview"), "diagram");
});

test("uses the source-and-diagram Mermaid view for a write default", () => {
  assert.equal(mermaidViewForDefaultEditorView("write"), "source-and-diagram");
});
