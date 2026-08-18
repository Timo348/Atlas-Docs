import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageSpace,
  spaceNameUpdateSchema,
} from "../src/lib/space-management";

test("space names are trimmed and constrained to the creation limits", () => {
  assert.deepEqual(spaceNameUpdateSchema.parse({ name: "  Product Design  " }), {
    name: "Product Design",
  });
  assert.equal(spaceNameUpdateSchema.safeParse({ name: " A " }).success, false);
  assert.equal(spaceNameUpdateSchema.safeParse({ name: "A".repeat(80) }).success, true);
  assert.equal(spaceNameUpdateSchema.safeParse({ name: "A".repeat(81) }).success, false);
  assert.equal(spaceNameUpdateSchema.safeParse({ name: "Atlas", slug: "changed" }).success, false);
});

test("only administrators and effective space owners may manage a space", () => {
  assert.equal(canManageSpace("ADMIN", null), true);
  assert.equal(canManageSpace("ADMIN", "VIEWER"), true);
  assert.equal(canManageSpace("MEMBER", "OWNER"), true);
  assert.equal(canManageSpace("MEMBER", "EDITOR"), false);
  assert.equal(canManageSpace("MEMBER", "VIEWER"), false);
  assert.equal(canManageSpace("MEMBER", null), false);
});
