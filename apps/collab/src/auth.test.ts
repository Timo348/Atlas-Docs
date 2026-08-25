import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { verifyCollaborationToken } from "./auth.js";

const secret = "a-secure-test-secret-with-more-than-32-characters";

test("accepts a token only for its page", async () => {
  const token = await new SignJWT({ pageId: "page-1", name: "Timo", readOnly: false })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject("user-1")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  const claims = await verifyCollaborationToken(token, secret, "page:page-1");
  assert.equal(claims.sub, "user-1");
  await assert.rejects(() => verifyCollaborationToken(token, secret, "page:page-2"));
});

test("preserves an optional page-share id", async () => {
  const token = await new SignJWT({ pageId: "page-1", name: "Shared editor", readOnly: false, shareId: "share-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject("share:share-1")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  const claims = await verifyCollaborationToken(token, secret, "page:page-1");
  assert.equal(claims.shareId, "share-1");
  assert.equal(claims.readOnly, false);
});

test("preserves a folder-share id and rejects ambiguous public-share claims", async () => {
  const folderToken = await new SignJWT({ pageId: "page-1", name: "Shared editor", readOnly: false, folderShareId: "folder-share-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject("folder-share:folder-share-1")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  const claims = await verifyCollaborationToken(folderToken, secret, "page:page-1");
  assert.equal(claims.folderShareId, "folder-share-1");

  const ambiguousToken = await new SignJWT({ pageId: "page-1", name: "Shared editor", readOnly: false, shareId: "share-1", folderShareId: "folder-share-1" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject("share:share-1")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));
  await assert.rejects(() => verifyCollaborationToken(ambiguousToken, secret, "page:page-1"));
});
