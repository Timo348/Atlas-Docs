import assert from "node:assert/strict";
import test from "node:test";
import { spaceRoleLabel, strongestSpaceRole } from "../src/lib/space-role";

test("returns the strongest direct or team role", () => {
  assert.equal(strongestSpaceRole(["VIEWER", "EDITOR"]), "EDITOR");
  assert.equal(strongestSpaceRole(["EDITOR", "OWNER", "VIEWER"]), "OWNER");
});

test("returns null when no grant exists", () => {
  assert.equal(strongestSpaceRole([null, undefined]), null);
});

test("formats roles consistently in English and German", () => {
  assert.equal(spaceRoleLabel("OWNER", "en"), "Owner");
  assert.equal(spaceRoleLabel("EDITOR", "en"), "Can edit");
  assert.equal(spaceRoleLabel("VIEWER", "de"), "Nur lesen");
  assert.equal(spaceRoleLabel("EDITOR", "de"), "Kann bearbeiten");
});
