import assert from "node:assert/strict";
import test from "node:test";
import { insertAt } from "../src/lib/tree-order";

test("insertAt moves an existing item without duplicating it", () => {
  assert.deepEqual(insertAt(["a", "b", "c"], "a", 2), ["b", "c", "a"]);
});

test("insertAt clamps positions for a new container", () => {
  assert.deepEqual(insertAt(["a", "b"], "c", 99), ["a", "b", "c"]);
  assert.deepEqual(insertAt(["a", "b"], "c", -2), ["c", "a", "b"]);
});
