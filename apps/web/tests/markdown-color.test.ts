import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { colorMarkdownText, isMarkdownTextColor, remarkAtlasTextColor } from "../src/lib/markdown-color";

function render(markdown: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkGfm, remarkAtlasTextColor],
  }, markdown));
}

test("Atlas Markdown colors render a fixed palette and keep nested Markdown", () => {
  const html = render("Before [[color:blue|blue **and bold** text]] after");

  assert.match(html, /Before <span class="atlas-text-color atlas-text-color-blue">blue <strong>and bold<\/strong> text<\/span> after/);
  assert.equal(colorMarkdownText("red", "Alert"), "[[color:red|Alert]]");
  assert.equal(isMarkdownTextColor("purple"), true);
  assert.equal(isMarkdownTextColor("#ff0000"), false);
});

test("invalid or unfinished Atlas color markers remain normal Markdown text", () => {
  assert.match(render("[[color:unknown|Text]]"), /\[\[color:unknown\|Text\]\]/);
  assert.match(render("[[color:red|Text"), /\[\[color:red\|Text/);
});
