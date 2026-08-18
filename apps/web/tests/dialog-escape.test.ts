import assert from "node:assert/strict";
import test from "node:test";
import {
  createDialogEscapeStack,
  dialogEscapeDecision,
  dispatchDialogEscape,
  escapeDismissesDialog,
  type DialogEscapeEntry,
} from "../src/components/use-dialog-escape";

const escape = { key: "Escape", defaultPrevented: false, isComposing: false };

function entry(token: symbol, blocked = false): DialogEscapeEntry {
  return { token, blocked, close() {} };
}

test("the last activated dialog is the only topmost Escape target", () => {
  const stack = createDialogEscapeStack();
  let bottomCloses = 0;
  let topCloses = 0;
  const bottom = { ...entry(Symbol("bottom")), close: () => { bottomCloses += 1; } };
  const top = { ...entry(Symbol("top")), close: () => { topCloses += 1; } };
  stack.activate(bottom);
  stack.activate(top);

  assert.equal(stack.top(), top);
  stack.activate(bottom);
  assert.equal(stack.top(), top, "updating an active token must not reorder the stack");
  assert.equal(dispatchDialogEscape(stack, fakeEvent().event), "dismiss");
  assert.equal(topCloses, 1);
  assert.equal(bottomCloses, 0);
  stack.deactivate(top.token);
  assert.equal(stack.top(), bottom);
});

test("a busy topmost dialog blocks Escape without exposing the dialog below", () => {
  const stack = createDialogEscapeStack();
  let bottomCloses = 0;
  let topCloses = 0;
  const bottom = { ...entry(Symbol("bottom")), close: () => { bottomCloses += 1; } };
  const top = { ...entry(Symbol("top"), true), close: () => { topCloses += 1; } };
  stack.activate(bottom);
  stack.activate(top);

  assert.equal(dialogEscapeDecision(stack.top(), escape), "block");
  assert.equal(stack.top(), top);
  assert.equal(stack.size(), 2);
  const consumed = fakeEvent();
  assert.equal(dispatchDialogEscape(stack, consumed.event), "block");
  assert.equal(consumed.prevented(), true);
  assert.equal(consumed.stopped(), true);
  assert.equal(bottomCloses, 0);
  assert.equal(topCloses, 0);
});

test("pre-handled and composing Escape events are ignored", () => {
  const target = entry(Symbol("target"));
  assert.equal(dialogEscapeDecision(target, { ...escape, defaultPrevented: true }), "ignore");
  assert.equal(dialogEscapeDecision(target, { ...escape, isComposing: true }), "ignore");
  assert.equal(escapeDismissesDialog("Enter", false), false);

  const stack = createDialogEscapeStack();
  stack.activate(target);
  const preHandled = fakeEvent({ defaultPrevented: true });
  assert.equal(dispatchDialogEscape(stack, preHandled.event), "ignore");
  assert.equal(preHandled.prevented(), false);
  assert.equal(preHandled.stopped(), false);
});

test("an idle topmost dialog accepts Escape", () => {
  assert.equal(escapeDismissesDialog("Escape", false), true);
});

function fakeEvent(overrides: Partial<typeof escape> = {}) {
  let prevented = false;
  let stopped = false;
  return {
    event: {
      ...escape,
      ...overrides,
      preventDefault() { prevented = true; },
      stopImmediatePropagation() { stopped = true; },
    },
    prevented: () => prevented,
    stopped: () => stopped,
  };
}
