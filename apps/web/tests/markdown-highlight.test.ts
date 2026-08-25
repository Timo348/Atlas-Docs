import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { highlightMarkdownCode, markdownCodeLanguage } from "../src/lib/markdown-highlight";

test("recognizes the six requested fenced-code languages and common aliases", () => {
  const cases = {
    "language-java": "java",
    "language-python": "python",
    "language-c": "c",
    "language-c#": "csharp",
    "language-c++": "cpp",
    "language-bash": "bash",
    "language-py": "python",
    "language-sh": "bash",
  } as const;

  for (const [className, language] of Object.entries(cases)) {
    assert.equal(markdownCodeLanguage(className), language);
  }
});

test("highlights supported code deterministically and leaves unknown languages alone", () => {
  const samples = {
    java: "public class Atlas {}",
    python: "def atlas():\n    return True",
    c: "int main(void) { return 0; }",
    csharp: "public class Atlas { }",
    cpp: "#include <iostream>\nint main() { return 0; }",
    bash: "if true; then echo Atlas; fi",
  } as const;

  for (const [language, source] of Object.entries(samples)) {
    const result = highlightMarkdownCode(source, `language-${language}`);
    assert.equal(result?.language, language);
    assert.match(result?.html ?? "", /class="hljs-/);
  }

  assert.equal(highlightMarkdownCode("SELECT 1", "language-sql"), null);
  assert.equal(highlightMarkdownCode("inline", undefined), null);
});

test("highlighted output escapes source HTML", () => {
  const result = highlightMarkdownCode("char *value = \"<script>\";", "language-c");
  assert.ok(result);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;/);
});

test("preview links and document width remain visible and responsive", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const linkRule = css.match(/\.markdown-preview a\s*\{([^}]+)\}/)?.[1];
  assert.ok(linkRule, "Missing Markdown preview link style");
  assert.match(linkRule, /color:\s*var\(--accent\)/);
  assert.match(linkRule, /text-decoration:\s*underline/);

  const previewRule = css.match(/\.markdown-preview\s*\{([^}]+)\}/)?.[1];
  assert.ok(previewRule, "Missing Markdown preview layout style");
  assert.match(previewRule, /width:\s*min\(1120px,\s*100%\)/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.markdown-preview\s*\{[^}]*padding:\s*30px 22px 80px/);
});

test("PDF print mode isolates an A4 document without keeping the application grid", () => {
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media print\s*\{/);
  assert.match(css, /@page\s*\{[^}]*size:\s*A4/);
  assert.match(css, /\.workspace, \.content, \.editor-shell, \.shared-page-frame\s*\{[^}]*display:\s*block\s*!important/);
  assert.match(css, /\.editor-header, \.editor-tabs, \.editor-body[^}]*display:\s*none\s*!important/);
  assert.match(css, /\.pdf-print-document, \.pdf-print-document \*\s*\{[^}]*visibility:\s*visible\s*!important/);
});
