import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  canChangeLocalPassword,
  currentPasswordMatches,
  passwordChangeSchema,
  profileUpdateSchema,
} from "../src/lib/account-settings";

test("accepts a trimmed profile display name within the account limits", () => {
  const parsed = profileUpdateSchema.parse({ name: "  Timo Example  " });
  assert.equal(parsed.name, "Timo Example");
  assert.equal(profileUpdateSchema.safeParse({ name: "x" }).success, false);
  assert.equal(profileUpdateSchema.safeParse({ name: " ".repeat(101) }).success, false);
});

test("requires a current password and a 12 to 128 character replacement", () => {
  assert.equal(passwordChangeSchema.safeParse({
    currentPassword: "",
    newPassword: "123456789012",
  }).success, false);
  assert.equal(passwordChangeSchema.safeParse({
    currentPassword: "current-password",
    newPassword: "short",
  }).success, false);
  assert.equal(passwordChangeSchema.safeParse({
    currentPassword: "current-password",
    newPassword: "new-password-12",
  }).success, true);
});

test("only local accounts can change a password and the current password must match", async () => {
  const passwordHash = await bcrypt.hash("current-password", 4);
  assert.equal(canChangeLocalPassword(null), false);
  assert.equal(canChangeLocalPassword(passwordHash), true);
  assert.equal(await currentPasswordMatches("current-password", passwordHash), true);
  assert.equal(await currentPasswordMatches("wrong-password", passwordHash), false);
  assert.equal(await currentPasswordMatches("current-password", null), false);
});
