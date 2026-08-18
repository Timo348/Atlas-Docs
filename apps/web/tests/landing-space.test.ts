import assert from "node:assert/strict";
import test from "node:test";
import { preferredLandingSpace } from "../src/lib/landing-space";

const spaces = ["space-a", "space-b", "space-c"];

test("a page deep link takes priority over every space preference", () => {
  assert.equal(preferredLandingSpace(spaces, {
    pageSpaceId: "space-c",
    requestedSpaceId: "space-b",
    defaultSpaceId: "space-a",
  }), "space-c");
});

test("an explicit space link takes priority over the account default", () => {
  assert.equal(preferredLandingSpace(spaces, {
    requestedSpaceId: "space-b",
    defaultSpaceId: "space-a",
  }), "space-b");
});

test("the account default is used for an unqualified application open", () => {
  assert.equal(preferredLandingSpace(spaces, { defaultSpaceId: "space-c" }), "space-c");
});

test("inaccessible selections fall back to the first accessible space", () => {
  assert.equal(preferredLandingSpace(spaces, {
    requestedSpaceId: "missing",
    defaultSpaceId: "revoked",
  }), "space-a");
  assert.equal(preferredLandingSpace([], { defaultSpaceId: "missing" }), null);
});
