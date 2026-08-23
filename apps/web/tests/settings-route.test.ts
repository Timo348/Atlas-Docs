import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function source(path: string) {
  return readFileSync(fileURLToPath(new URL("../src/" + path, import.meta.url)), "utf8");
}

test("the settings page is protected and uses account preferences", () => {
  const settingsPage = source("app/settings/page.tsx");
  assert.match(settingsPage, /requireUser\(\)/);
  assert.match(settingsPage, /PreferencesProvider/);
  assert.match(settingsPage, /fileViewDefaults/);
  assert.match(settingsPage, /canChangePassword/);
});

test("the workspace profile entry opens settings instead of the dialog", () => {
  const workspace = source("components/workspace-shell.tsx");
  assert.match(workspace, /href="\/settings"/);
  assert.doesNotMatch(workspace, /ProfileDialog/);
});
