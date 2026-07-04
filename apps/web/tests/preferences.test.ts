import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PREFERENCES, normalizePreferences } from "../src/lib/preferences";

test("accepts Helvetica as a persisted interface font", () => {
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, uiFont: "helvetica" }).uiFont, "helvetica");
});

test("falls back to accessible defaults for invalid preference data", () => {
  assert.deepEqual(normalizePreferences({ ...DEFAULT_PREFERENCES, colorTheme: "neon" }), DEFAULT_PREFERENCES);
});
