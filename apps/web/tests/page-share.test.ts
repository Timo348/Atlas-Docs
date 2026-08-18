import assert from "node:assert/strict";
import test from "node:test";
import {
  canManagePageShares,
  createPageShareToken,
  pageShareIsActive,
  pageShareIsReadOnly,
  pageShareTokenHash,
  validPageShareToken,
} from "../src/lib/page-share";
import { sharedPageImageUrl } from "../src/lib/shared-page-images";

test("share tokens are random URL-safe 256-bit credentials", () => {
  const first = createPageShareToken();
  const second = createPageShareToken();
  assert.equal(validPageShareToken(first), true);
  assert.equal(validPageShareToken(second), true);
  assert.notEqual(first, second);
  assert.equal(pageShareTokenHash(first).length, 64);
  assert.equal(pageShareTokenHash(first), pageShareTokenHash(first));
});

test("revoked and expired shares are inactive", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  assert.equal(pageShareIsActive({ revokedAt: null, expiresAt: null }, now), true);
  assert.equal(pageShareIsActive({ revokedAt: null, expiresAt: new Date("2026-08-18T12:00:01.000Z") }, now), true);
  assert.equal(pageShareIsActive({ revokedAt: null, expiresAt: now }, now), false);
  assert.equal(pageShareIsActive({ revokedAt: now, expiresAt: null }, now), false);
});

test("only administrators and space owners manage page links", () => {
  assert.equal(canManagePageShares("ADMIN", null), true);
  assert.equal(canManagePageShares("MEMBER", "OWNER"), true);
  assert.equal(canManagePageShares("MEMBER", "EDITOR"), false);
  assert.equal(canManagePageShares("MEMBER", "VIEWER"), false);
});

test("share permissions map to collaboration read-only state", () => {
  assert.equal(pageShareIsReadOnly("VIEW"), true);
  assert.equal(pageShareIsReadOnly("EDIT"), false);
});

test("only page-local stored image URLs are rewritten", () => {
  assert.equal(
    sharedPageImageUrl("/api/pages/page-1/images/image-2", "page-1", "token"),
    "/api/public/shares/token/images/image-2",
  );
  assert.equal(
    sharedPageImageUrl("/api/pages/other/images/image-2", "page-1", "token"),
    "/api/pages/other/images/image-2",
  );
  assert.equal(sharedPageImageUrl("https://example.com/image.png", "page-1", "token"), "https://example.com/image.png");
});
