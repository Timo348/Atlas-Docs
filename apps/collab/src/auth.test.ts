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
