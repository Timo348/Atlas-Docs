import assert from "node:assert/strict";
import test from "node:test";
import { workspaceShortcut } from "../src/lib/workspace-shortcuts";

const baseEvent = {
  key: "n",
  altKey: false,
  ctrlKey: true,
  metaKey: false,
  shiftKey: true,
  defaultPrevented: false,
  isComposing: false,
  repeat: false,
};

test("maps cross-platform workspace shortcuts", () => {
  assert.equal(workspaceShortcut(baseEvent), "new-file");
  assert.equal(workspaceShortcut({ ...baseEvent, key: "K" }), "switch-space");
  assert.equal(workspaceShortcut({ ...baseEvent, ctrlKey: false, metaKey: true }), "new-file");
});

test("ignores incomplete, composing, repeated, or pre-handled shortcuts", () => {
  assert.equal(workspaceShortcut({ ...baseEvent, shiftKey: false }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, ctrlKey: false }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, altKey: true }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, defaultPrevented: true }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, isComposing: true }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, repeat: true }), null);
  assert.equal(workspaceShortcut({ ...baseEvent, key: "x" }), null);
});
