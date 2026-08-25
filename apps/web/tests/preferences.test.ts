import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  fileViewDefaultsForDefaultEditorView,
  normalizePreferences,
  preferencesUpdateSchema,
  resolveLanguage,
} from "../src/lib/preferences";

test("accepts Helvetica as a persisted interface font", () => {
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, uiFont: "helvetica" }).uiFont, "helvetica");
});

test("accepts a persisted default document view", () => {
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, defaultEditorView: "preview" }).defaultEditorView, "preview");
});

test("persists individual opening views for configurable file types", () => {
  const preferences = normalizePreferences({
    ...DEFAULT_PREFERENCES,
    fileViewDefaults: {
      markdown: "preview",
      latex: "write",
      mermaid: "diagram",
      gantt: "source-and-diagram",
    },
  });
  assert.deepEqual(preferences.fileViewDefaults, {
    markdown: "preview",
    latex: "write",
    mermaid: "diagram",
    gantt: "source-and-diagram",
  });
});

test("maps the legacy global view to equivalent per-file defaults", () => {
  assert.deepEqual(fileViewDefaultsForDefaultEditorView("write"), {
    markdown: "write",
    latex: "write",
    mermaid: "source-and-diagram",
    gantt: "diagram",
  });
  assert.deepEqual(fileViewDefaultsForDefaultEditorView("preview"), {
    markdown: "preview",
    latex: "preview",
    mermaid: "diagram",
    gantt: "diagram",
  });
});

test("keeps Gantt appearance defaults compatible with existing saved preferences", () => {
  const { ganttAppearance: _ganttAppearance, ...legacy } = DEFAULT_PREFERENCES;
  const preferences = normalizePreferences(legacy);
  assert.equal(preferences.ganttAppearance.dimPastDates, true);
  assert.deepEqual(preferences.ganttAppearance.statuses.active, { label: "", color: "#9b6cc4" });
});

test("accepts existing preference API payloads without Gantt appearance data", () => {
  const { ganttAppearance: _ganttAppearance, ...legacy } = DEFAULT_PREFERENCES;
  const parsed = preferencesUpdateSchema.parse(legacy);
  assert.equal(parsed.ganttAppearance.dimPastDates, true);
});

test("persists custom Gantt state meanings and colors", () => {
  const preferences = normalizePreferences({
    ...DEFAULT_PREFERENCES,
    ganttAppearance: {
      ...DEFAULT_PREFERENCES.ganttAppearance,
      dimPastDates: false,
      statuses: {
        ...DEFAULT_PREFERENCES.ganttAppearance.statuses,
        done: { label: "Approved", color: "#1a7f55" },
      },
    },
  });
  assert.deepEqual(preferences.ganttAppearance, {
    dimPastDates: false,
    statuses: {
      none: { label: "", color: "#3480c8" },
      active: { label: "", color: "#9b6cc4" },
      done: { label: "Approved", color: "#1a7f55" },
      crit: { label: "", color: "#cf5b4e" },
    },
  });
});

test("accepts a nullable default landing space", () => {
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, defaultSpaceId: "cm12345678901234567890123" }).defaultSpaceId, "cm12345678901234567890123");
  assert.equal(normalizePreferences({ ...DEFAULT_PREFERENCES, defaultSpaceId: null }).defaultSpaceId, null);
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
