import assert from "node:assert/strict";
import test from "node:test";
import { slugify } from "../src/lib/slug";

test("creates stable URL slugs", () => {
  assert.equal(slugify("Über die Straße"), "uber-die-stra-e");
  assert.equal(slugify("  Architektur & Betrieb  "), "architektur-betrieb");
  assert.equal(slugify("✨"), "seite");
});
