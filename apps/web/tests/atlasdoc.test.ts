import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  addAtlasDocElement,
  copyAtlasDoc,
  createAtlasDocCollaborationStateFromJson,
  createAtlasDocUndoManager,
  deleteAtlasDocElement,
  deleteAtlasDocSnippet,
  initializeAtlasDoc,
  readAtlasDoc,
  serializeAtlasDoc,
  updateAtlasDocElement,
  updateAtlasDocSettings,
  upsertAtlasDocSnippet,
} from "../src/lib/atlasdoc";

test("AtlasDoc initializes as a localized A4 document with editable elements", () => {
  const document = new Y.Doc();
  initializeAtlasDoc(document, "de");
  const state = readAtlasDoc(document);

  assert.deepEqual(state.settings, { gridVisible: false, snapToGrid: true });
  assert.equal(state.elements[0]?.type, "heading");
  assert.match(state.elements[0]?.text || "", /Atlas-Dokument/);
  assert.equal(state.snippets.length, 2);
  assert.equal(initializeAtlasDoc(document, "en"), false);
  document.destroy();
});

test("AtlasDoc undo excludes initialization and groups consecutive local typing", () => {
  const document = new Y.Doc();
  const history = createAtlasDocUndoManager(document);
  initializeAtlasDoc(document);
  assert.equal(history.canUndo(), false);
  const original = readAtlasDoc(document).elements[0];

  for (const text of ["h", "ha", "hal", "hall", "hallo"]) updateAtlasDocElement(document, original.id, { text });
  assert.equal(readAtlasDoc(document).elements[0].text, "hallo");
  assert.equal(history.undoStack.length, 1);
  history.undo();
  assert.equal(readAtlasDoc(document).elements[0].text, original.text);
  history.redo();
  assert.equal(readAtlasDoc(document).elements[0].text, "hallo");
  history.destroy();
  document.destroy();
});

test("AtlasDoc undo restores inserted/deleted elements, settings and snippets", () => {
  const document = new Y.Doc();
  initializeAtlasDoc(document);
  const history = createAtlasDocUndoManager(document);
  const id = addAtlasDocElement(document, { type: "text", text: "New element" });
  history.stopCapturing();
  deleteAtlasDocElement(document, id);
  history.undo();
  assert.equal(readAtlasDoc(document).elements.find((element) => element.id === id)?.text, "New element");
  history.undo();
  assert.equal(readAtlasDoc(document).elements.some((element) => element.id === id), false);
  history.redo();
  assert.equal(readAtlasDoc(document).elements.some((element) => element.id === id), true);

  history.stopCapturing();
  updateAtlasDocSettings(document, { gridVisible: true });
  history.undo();
  assert.equal(readAtlasDoc(document).settings.gridVisible, false);
  history.redo();
  assert.equal(readAtlasDoc(document).settings.gridVisible, true);

  history.stopCapturing();
  const snippetId = upsertAtlasDocSnippet(document, { name: "Custom", command: "custom", description: "", html: "<b>Custom</b>", css: "" })!;
  history.stopCapturing();
  deleteAtlasDocSnippet(document, snippetId);
  history.undo();
  assert.equal(readAtlasDoc(document).snippets.some((snippet) => snippet.id === snippetId), true);
  history.undo();
  assert.equal(readAtlasDoc(document).snippets.some((snippet) => snippet.id === snippetId), false);
  history.destroy();
  document.destroy();
});

test("AtlasDoc undo preserves remote edits and cannot undo a synced document", () => {
  const local = new Y.Doc();
  const remote = new Y.Doc();
  initializeAtlasDoc(remote);
  const history = createAtlasDocUndoManager(local);
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));
  assert.equal(history.canUndo(), false);
  const [heading, body] = readAtlasDoc(local).elements;
  updateAtlasDocElement(local, heading.id, { text: "My heading" });
  updateAtlasDocElement(remote, body.id, { text: "Their body" });
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local)));
  assert.equal(history.undoStack.length, 1);
  history.undo();
  assert.equal(readAtlasDoc(local).elements.find((element) => element.id === heading.id)?.text, heading.text);
  assert.equal(readAtlasDoc(local).elements.find((element) => element.id === body.id)?.text, "Their body");
  history.redo();
  assert.equal(readAtlasDoc(local).elements.find((element) => element.id === heading.id)?.text, "My heading");
  assert.equal(readAtlasDoc(local).elements.find((element) => element.id === body.id)?.text, "Their body");
  history.destroy();
  local.destroy();
  remote.destroy();
});

test("AtlasDoc undo never overwrites a collaborator's later edit of the same element", () => {
  const local = new Y.Doc();
  const remote = new Y.Doc();
  initializeAtlasDoc(local);
  const history = createAtlasDocUndoManager(local);
  const original = readAtlasDoc(local).elements[0];
  updateAtlasDocElement(local, original.id, { text: "My heading" });
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
  updateAtlasDocElement(remote, original.id, { text: "Their later heading" });
  Y.applyUpdate(local, Y.encodeStateAsUpdate(remote, Y.encodeStateVector(local)));
  history.undo();
  assert.equal(readAtlasDoc(local).elements.find((element) => element.id === original.id)?.text, "Their later heading");
  history.destroy();
  local.destroy();
  remote.destroy();
});

test("AtlasDoc no-op writes do not consume history or invalidate redo", () => {
  const document = new Y.Doc();
  initializeAtlasDoc(document);
  const history = createAtlasDocUndoManager(document);
  const element = readAtlasDoc(document).elements[0];
  updateAtlasDocElement(document, element.id, { text: element.text });
  updateAtlasDocSettings(document, { gridVisible: false });
  assert.equal(history.canUndo(), false);
  updateAtlasDocElement(document, element.id, { text: "Edited" });
  history.undo();
  updateAtlasDocElement(document, element.id, { text: element.text });
  assert.equal(history.canRedo(), true);
  updateAtlasDocElement(document, element.id, { text: "Replacement" });
  assert.equal(history.canRedo(), false);
  history.destroy();
  document.destroy();
});

test("AtlasDoc element changes, snippets, settings, and visible snapshots round-trip", () => {
  const source = new Y.Doc();
  const target = new Y.Doc();
  initializeAtlasDoc(source);
  const id = addAtlasDocElement(source, { type: "table", x: 100, y: 400 });
  assert.equal(updateAtlasDocElement(source, id, { locked: true, rows: [["A", "B"]] }), true);
  updateAtlasDocSettings(source, { gridVisible: true });
  const snippetId = upsertAtlasDocSnippet(source, { name: "Badge", command: "badge", description: "", html: "<b>Badge</b>", css: "b{color:blue}" });
  assert.ok(snippetId);

  const state = readAtlasDoc(source);
  assert.equal(state.settings.gridVisible, true);
  assert.equal(state.elements.find((element) => element.id === id)?.locked, true);
  assert.deepEqual(state.elements.find((element) => element.id === id)?.rows, [["A", "B"]]);
  assert.equal(state.snippets.some((snippet) => snippet.command === "badge"), true);
  assert.match(serializeAtlasDoc(source), /"format": "atlasdoc"/);

  copyAtlasDoc(source, target);
  assert.deepEqual(readAtlasDoc(target), state);
  source.destroy();
  target.destroy();
});

test("AtlasDoc JSON imports into a collaboration state and rejects another format", () => {
  const state = createAtlasDocCollaborationStateFromJson(JSON.stringify({
    format: "atlasdoc",
    version: 1,
    elements: [{ id: "heading-1", type: "heading", text: "Imported" }],
    settings: { gridVisible: true, snapToGrid: false },
    snippets: [],
  }));
  const document = new Y.Doc();
  Y.applyUpdate(document, state);
  assert.equal(readAtlasDoc(document).elements.find((element) => element.id === "heading-1")?.text, "Imported");
  assert.deepEqual(readAtlasDoc(document).settings, { gridVisible: true, snapToGrid: false });
  document.destroy();
  assert.throws(() => createAtlasDocCollaborationStateFromJson('{"format":"markdown"}'));
});
