import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  addAtlasDocElement,
  copyAtlasDoc,
  createAtlasDocCollaborationStateFromJson,
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
