import assert from "node:assert/strict";
import test from "node:test";
import { editorHistoryAction } from "../src/lib/editor-history-shortcuts";

const key = { key: "z", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false };

test("document history supports Windows and Mac undo and redo shortcuts", () => {
  assert.equal(editorHistoryAction(key), "undo");
  assert.equal(editorHistoryAction({ ...key, ctrlKey: false, metaKey: true }), "undo");
  assert.equal(editorHistoryAction({ ...key, key: "Z", shiftKey: true }), "redo");
  assert.equal(editorHistoryAction({ ...key, ctrlKey: false, metaKey: true, shiftKey: true }), "redo");
  assert.equal(editorHistoryAction({ ...key, key: "y" }), "redo");
});

test("document history leaves text input, IME, AltGr and handled shortcuts alone", () => {
  assert.equal(editorHistoryAction({ ...key, ctrlKey: false }), null);
  assert.equal(editorHistoryAction({ ...key, altKey: true }), null);
  assert.equal(editorHistoryAction({ ...key, isComposing: true }), null);
  assert.equal(editorHistoryAction({ ...key, nativeEvent: { isComposing: true } }), null);
  assert.equal(editorHistoryAction({ ...key, defaultPrevented: true }), null);
  assert.equal(editorHistoryAction({ ...key, key: "s" }), null);
  assert.equal(editorHistoryAction({ ...key, key: "y", shiftKey: true }), null);
});
