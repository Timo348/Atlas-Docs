import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCollaborationPermission,
  collaborationIsReadOnly,
  completeInitialCollaborationSync,
  createCollaborationAccessState,
} from "../src/lib/collaboration-access";

test("write access remains gated until the document completes its initial sync", () => {
  let state = createCollaborationAccessState("page-a");
  assert.equal(collaborationIsReadOnly(state, "page-a"), true);

  state = applyCollaborationPermission(state, "page-a", false);
  assert.equal(collaborationIsReadOnly(state, "page-a"), true);

  state = completeInitialCollaborationSync(state, "page-a");
  assert.equal(collaborationIsReadOnly(state, "page-a"), false);
});

test("a reconnect does not close the editor after the first successful sync", () => {
  let state = createCollaborationAccessState("page-a");
  state = applyCollaborationPermission(state, "page-a", false);
  state = completeInitialCollaborationSync(state, "page-a");

  // A reconnect requests a fresh token, but must not reset the one-time sync gate.
  state = applyCollaborationPermission(state, "page-a", false);
  assert.equal(state.initialSyncComplete, true);
  assert.equal(collaborationIsReadOnly(state, "page-a"), false);
});

test("server read-only access stays read-only after sync", () => {
  let state = createCollaborationAccessState("page-a");
  state = applyCollaborationPermission(state, "page-a", true);
  state = completeInitialCollaborationSync(state, "page-a");
  assert.equal(collaborationIsReadOnly(state, "page-a"), true);
});

test("stale access state and events cannot unlock a different document", () => {
  let state = createCollaborationAccessState("page-a");
  state = applyCollaborationPermission(state, "page-a", false);
  state = completeInitialCollaborationSync(state, "page-a");

  assert.equal(collaborationIsReadOnly(state, "page-b"), true);
  assert.equal(applyCollaborationPermission(state, "page-b", false), state);
  assert.equal(completeInitialCollaborationSync(state, "page-b"), state);
});
