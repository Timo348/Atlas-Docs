import assert from "node:assert/strict";
import test from "node:test";
import {
  collaborationDocumentsForPages,
  confirmsSpaceDeletion,
} from "../src/lib/space-deletion";

test("space deletion requires the exact space name", () => {
  assert.equal(confirmsSpaceDeletion("Engineering", "Engineering"), true);
  assert.equal(confirmsSpaceDeletion("engineering", "Engineering"), false);
  assert.equal(confirmsSpaceDeletion("Engineering ", "Engineering"), false);
  assert.equal(confirmsSpaceDeletion("", "Engineering"), false);
});

test("space deletion removes every related collaboration document", () => {
  assert.deepEqual(
    collaborationDocumentsForPages(["page-a", "page-b"]),
    ["page:page-a", "page:page-b"],
  );
  assert.deepEqual(collaborationDocumentsForPages([]), []);
});
