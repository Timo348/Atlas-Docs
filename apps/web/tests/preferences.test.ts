import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PREFERENCES, normalizePreferences, resolveLanguage } from "../src/lib/preferences";

test("accepts Helvetica as a persisted interface font", () => {
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, uiFont: "helvetica" }).uiFont, "helvetica");
});

test("falls back to accessible defaults for invalid preference data", () => {
  assert.deepEqual(normalizePreferences({ ...DEFAULT_PREFERENCES, colorTheme: "neon" }), DEFAULT_PREFERENCES);
});

test("prefers a stored supported language", () => {
  assert.equal(resolveLanguage("de", "en-US,en;q=0.9"), "de");
  assert.equal(resolveLanguage("en", "de-DE,de;q=0.9"), "en");
});

test("negotiates English and German from Accept-Language", () => {
  assert.equal(resolveLanguage(undefined, "fr-FR, de-DE;q=0.9, en;q=0.8"), "de");
  assert.equal(resolveLanguage(undefined, "en-US,en;q=0.9,de;q=0.7"), "en");
  assert.equal(resolveLanguage(undefined, "de ; q=0.8, en;q=0.7"), "de");
  assert.equal(resolveLanguage("fr", "fr-FR"), "en");
});

test("ignores explicitly excluded and malformed Accept-Language candidates", () => {
  assert.equal(resolveLanguage(undefined, "de;q=0, en;q=0.5"), "en");
  assert.equal(resolveLanguage(undefined, "de;q=invalid, en;q=0.4"), "en");
  assert.equal(resolveLanguage(undefined, "de;q=1.5, en;q=0.3"), "en");
  assert.equal(resolveLanguage(undefined, "de;q=0.1234, en;q=0.2"), "en");
});
