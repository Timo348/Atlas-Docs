import assert from "node:assert/strict";
import test from "node:test";
import { pageAfterDeletion } from "../src/lib/page-deletion";

const pages = [
  { id: "root-a", folderId: null },
  { id: "root-b", folderId: null },
  { id: "folder-a", folderId: "folder" },
  { id: "folder-b", folderId: "folder" },
];

test("page deletion prefers the next sibling", () => {
  assert.equal(pageAfterDeletion(pages, "root-a")?.id, "root-b");
  assert.equal(pageAfterDeletion(pages, "folder-a")?.id, "folder-b");
});

test("page deletion falls back to the previous sibling and then another file", () => {
  assert.equal(pageAfterDeletion(pages, "root-b")?.id, "root-a");
  assert.equal(pageAfterDeletion(pages.slice(0, 3), "folder-a")?.id, "root-a");
});

test("deleting the final page leaves no navigation target", () => {
  assert.equal(pageAfterDeletion([{ id: "only", folderId: null }], "only"), null);
});
