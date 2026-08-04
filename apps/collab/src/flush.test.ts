import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedFlush } from "./flush.js";

test("flush authorization requires an exact bearer secret", () => {
  const secret = "a-secret-that-is-long-enough-for-tests";
  assert.equal(isAuthorizedFlush(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedFlush(`Bearer ${secret}-wrong`, secret), false);
  assert.equal(isAuthorizedFlush(secret, secret), false);
  assert.equal(isAuthorizedFlush(undefined, secret), false);
});
