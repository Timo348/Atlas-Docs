import assert from "node:assert/strict";
import test from "node:test";
import { strongestSpaceRole } from "../src/lib/space-role";

test("returns the strongest direct or team role", () => {
  assert.equal(strongestSpaceRole(["VIEWER", "EDITOR"]), "EDITOR");
  assert.equal(strongestSpaceRole(["EDITOR", "OWNER", "VIEWER"]), "OWNER");
});

test("returns null when no grant exists", () => {
  assert.equal(strongestSpaceRole([null, undefined]), null);
});
