import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const requiredPairs: [string, string, number][] = [
  ["ink", "paper", 7],
  ["muted", "paper", 4.5],
  ["ink", "surface", 7],
  ["muted", "surface", 4.5],
  ["green", "surface", 4.5],
  ["on-green", "green", 4.5],
  ["terracotta", "paper", 4.5],
  ["success-text", "success-bg", 4.5],
  ["warning-text", "warning-bg", 4.5],
  ["danger-text", "danger-bg", 4.5],
  ["code-text", "code-block", 7],
  ["toast-text", "toast", 7],
];

for (const [theme, selector] of [
  ["light", ":root"],
  ["dark", "html[data-theme=\"dark\"]"],
] as const) {
  test(`${theme} theme semantic colors meet WCAG contrast targets`, () => {
    const variables = variablesFor(selector);
    for (const [foreground, background, minimum] of requiredPairs) {
      const ratio = contrast(variables[foreground], variables[background]);
      assert.ok(
        ratio >= minimum,
        `${foreground} on ${background} is ${ratio.toFixed(2)}:1, expected at least ${minimum}:1`,
      );
    }
  });
}

function variablesFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(block, `Missing ${selector} color block`);
  return Object.fromEntries(
    Array.from(block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi), (match) => [match[1], match[2]]),
  );
}

function contrast(foreground: string, background: string) {
  assert.ok(foreground && background, "Contrast colors must be defined as six-digit hex values");
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function luminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi)!.map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
