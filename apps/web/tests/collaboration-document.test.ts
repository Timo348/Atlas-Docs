import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  collaborationStateNeedsInitialization,
  createInitialCollaborationState,
  initialCollaborationContent,
  initialCollaborationDocumentUpsert,
  initializeCollaborationDocument,
  resolveCollaborationLanguage,
} from "../src/lib/collaboration-document";

test("creates the existing localized Markdown and LaTeX templates", () => {
  assert.equal(initialCollaborationContent("MARKDOWN", "en"), "# Headline\n");
  assert.equal(initialCollaborationContent("MARKDOWN", "de"), "# Überschrift\n");
  assert.equal(
    initialCollaborationContent("LATEX", "en"),
    "\\documentclass{article}\n\\begin{document}\n\\section{Headline}\n\\end{document}\n",
  );
  assert.equal(
    initialCollaborationContent("LATEX", "de"),
    "\\documentclass{article}\n\\begin{document}\n\\section{Überschrift}\n\\end{document}\n",
  );
});

test("encodes the initial content as an applicable Yjs state update", () => {
  const state = createInitialCollaborationState("MARKDOWN", "de");
  const document = new Y.Doc();
  Y.applyUpdate(document, state);

  assert.equal(document.getText("markdown").toString(), "# Überschrift\n");
  document.destroy();
});

test("creates an initialized canvas document without page text", () => {
  assert.equal(initialCollaborationContent("CANVAS", "de"), "");
  const state = createInitialCollaborationState("CANVAS", "de");
  const document = new Y.Doc();
  Y.applyUpdate(document, state);

  assert.equal(document.getText("markdown").toString(), "");
  assert.equal(document.getMap("canvas-settings").get("viewBackgroundColor"), "#fbfaf7");
  assert.equal(collaborationStateNeedsInitialization(state), false);
  document.destroy();
});

test("initialization and repeated update delivery insert the template exactly once", () => {
  const source = new Y.Doc();
  assert.equal(initializeCollaborationDocument(source, "MARKDOWN", "en"), true);
  assert.equal(initializeCollaborationDocument(source, "MARKDOWN", "de"), false);
  assert.equal(source.getText("markdown").toString(), "# Headline\n");

  const state = Y.encodeStateAsUpdate(source);
  const target = new Y.Doc();
  Y.applyUpdate(target, state);
  Y.applyUpdate(target, state);
  assert.equal(target.getText("markdown").toString(), "# Headline\n");
  source.destroy();
  target.destroy();
});

test("detects missing and structurally empty collaboration states", () => {
  const emptyDocument = new Y.Doc();
  const emptyUpdate = Y.encodeStateAsUpdate(emptyDocument);

  assert.equal(collaborationStateNeedsInitialization(null), true);
  assert.equal(collaborationStateNeedsInitialization(undefined), true);
  assert.equal(collaborationStateNeedsInitialization(new Uint8Array()), true);
  assert.equal(collaborationStateNeedsInitialization(emptyUpdate), true);
  emptyDocument.destroy();
});

test("does not reseed a document deliberately deleted to visible emptiness", () => {
  const document = new Y.Doc();
  const text = document.getText("markdown");
  text.insert(0, "deliberately deleted");
  text.delete(0, text.length);
  const deletedToEmptyState = Y.encodeStateAsUpdate(document);

  assert.equal(text.toString(), "");
  assert.ok(Y.decodeUpdate(deletedToEmptyState).structs.length > 0);
  assert.equal(collaborationStateNeedsInitialization(deletedToEmptyState), false);
  document.destroy();
});

test("preserves malformed non-empty collaboration states for recovery", () => {
  const malformedStates = [
    Uint8Array.of(1),
    Uint8Array.of(0, 0, 1),
    Uint8Array.of(255, 255, 255),
  ];

  for (const state of malformedStates) {
    assert.doesNotThrow(() => collaborationStateNeedsInitialization(state));
    assert.equal(collaborationStateNeedsInitialization(state), false);
  }
});

test("the legacy upsert is deterministic and cannot overwrite existing state", () => {
  const upsert = initialCollaborationDocumentUpsert("page-1", "LATEX", "en");
  assert.deepEqual(upsert.where, { name: "page:page-1" });
  assert.deepEqual(upsert.update, { name: "page:page-1" });
  assert.equal("data" in upsert.update, false);

  const document = new Y.Doc();
  Y.applyUpdate(document, upsert.create.data);
  assert.equal(document.getText("markdown").toString(), initialCollaborationContent("LATEX", "en"));
  document.destroy();
});

test("prefers the creator language and falls back to the authenticated user", () => {
  assert.equal(resolveCollaborationLanguage("de", "en"), "de");
  assert.equal(resolveCollaborationLanguage("invalid", "de"), "de");
  assert.equal(resolveCollaborationLanguage(null, "invalid"), "en");
});
