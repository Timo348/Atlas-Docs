import assert from "node:assert/strict";
import test from "node:test";
import { pageIdFromDocumentName } from "./document-name.js";

test("collaboration document names resolve to page ids", () => {
  assert.equal(pageIdFromDocumentName("page:page-123"), "page-123");
  assert.equal(pageIdFromDocumentName("page:"), null);
  assert.equal(pageIdFromDocumentName("folder:page-123"), null);
});
