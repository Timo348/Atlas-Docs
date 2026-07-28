import assert from "node:assert/strict";
import test from "node:test";
import {
  applySlashCommand,
  continueMarkdownList,
  editTable,
  markdownDocumentSegments,
  slashMatchAt,
  tableAt,
  updateTableCell,
} from "../src/lib/markdown-editor";

test("detects and expands a slash command on the current line", () => {
  const source = "Intro\n/table";
  const match = slashMatchAt(source, source.length);
  assert.deepEqual(match, { start: 6, end: 12, query: "table" });
  const edit = applySlashCommand(source, match!, "table", "en");
  assert.match(edit.text, /\| Column 1 \| Column 2 \|/);
  assert.equal(tableAt(edit.text, edit.cursor)?.columns, 2);
});

test("does not treat inline slashes as commands", () => {
  assert.equal(slashMatchAt("Visit https://example.com/", 26), null);
  assert.equal(slashMatchAt("text /table", 11), null);
});

test("expands code blocks and localized headings", () => {
  const codeSource = "/codeblock";
  const codeEdit = applySlashCommand(codeSource, slashMatchAt(codeSource, codeSource.length)!, "codeblock", "en");
  assert.equal(codeEdit.text, "```text\n\n```");
  const headingSource = "/heading1";
  const headingEdit = applySlashCommand(headingSource, slashMatchAt(headingSource, headingSource.length)!, "heading1", "de");
  assert.equal(headingEdit.text, "# Überschrift");
});

test("adds and removes table rows and columns", () => {
  const source = "| A | B |\n| --- | --- |\n| one | two |";
  const cursor = source.indexOf("one");
  const rowEdit = editTable(source, cursor, "add-row");
  assert.ok(rowEdit);
  assert.equal(tableAt(rowEdit.text, rowEdit.cursor)?.rows, 3);
  const columnEdit = editTable(rowEdit.text, rowEdit.cursor, "add-column");
  assert.ok(columnEdit);
  assert.equal(tableAt(columnEdit.text, columnEdit.cursor)?.columns, 3);
  const removeColumn = editTable(columnEdit.text, columnEdit.cursor, "remove-column");
  assert.ok(removeColumn);
  assert.equal(tableAt(removeColumn.text, removeColumn.cursor)?.columns, 2);
});

test("keeps at least one data row and one column", () => {
  const source = "| A |\n| --- |\n| one |";
  const cursor = source.indexOf("one");
  assert.equal(editTable(source, cursor, "remove-row"), null);
  assert.equal(editTable(source, cursor, "remove-column"), null);
});

test("exposes valid tables as lossless hybrid document segments", () => {
  const source = "Before\n| A | B |\n| :--- | ---: |\n| one | two |\nAfter";
  const segments = markdownDocumentSegments(source);
  assert.deepEqual(segments.map((segment) => segment.type), ["text", "table", "text"]);
  assert.equal(segments[0].type === "text" && segments[0].value, "Before\n");
  assert.equal(segments[2].type === "text" && segments[2].value, "\nAfter");
  assert.deepEqual(segments[1].type === "table" && segments[1].table.rows, [
    ["A", "B"],
    ["one", "two"],
  ]);
  assert.equal(
    segments.map((segment) => source.slice(segment.start, segment.end)).join(""),
    source,
  );
});

test("keeps empty hybrid text inputs before and after a standalone table", () => {
  const source = "| A | B |\n| --- | --- |\n| one | two |";
  const segments = markdownDocumentSegments(source);
  assert.deepEqual(segments.map((segment) => segment.type), ["text", "table", "text"]);
  assert.equal(segments[0].type === "text" && segments[0].value, "");
  assert.equal(segments[2].type === "text" && segments[2].value, "");
});

test("edits visual cells while preserving Markdown and separator alignment", () => {
  const source = "| A | B |\n| :--- | ---: |\n| one | two |";
  const cellEdit = updateTableCell(source, source.indexOf("one"), 1, 0, "left | right");
  assert.ok(cellEdit);
  assert.match(cellEdit.text, /\| left \\\| right \| two \|/);
  assert.match(cellEdit.text, /\| :--- \| ---: \|/);
  const visual = markdownDocumentSegments(cellEdit.text).find((segment) => segment.type === "table");
  assert.equal(visual?.type === "table" && visual.table.rows[1][0], "left | right");

  const columnEdit = editTable(cellEdit.text, cellEdit.cursor, "add-column");
  assert.ok(columnEdit);
  assert.match(columnEdit.text, /\| :--- \| --- \| ---: \|/);
});

test("recognizes GFM tables without outer pipes but ignores fenced examples", () => {
  const source = "A | B\n--- | ---\none | two";
  assert.equal(markdownDocumentSegments(source).some((segment) => segment.type === "table"), true);
  const fenced = "```md\nA | B\n--- | ---\none | two\n```";
  assert.deepEqual(markdownDocumentSegments(fenced), [
    { type: "text", start: 0, end: fenced.length, value: fenced },
  ]);
});

test("normalizes short and long GFM body rows without splitting the table", () => {
  const source = "| A | B |\n| --- | --- |\n| one |\n| two | three | ignored |";
  const segment = markdownDocumentSegments(source).find((entry) => entry.type === "table");
  assert.equal(segment?.type, "table");
  if (segment?.type !== "table") return;
  assert.equal(segment.end, source.length);
  assert.deepEqual(segment.table.rows, [
    ["A", "B"],
    ["one", ""],
    ["two", "three"],
  ]);
});

test("round-trips escaped pipes and backslashes in visual table cells", () => {
  const source = "| A | B |\n| --- | --- |\n| one | two |";
  const edit = updateTableCell(source, source.indexOf("one"), 1, 0, "\\|");
  assert.ok(edit);
  const segment = markdownDocumentSegments(edit.text).find((entry) => entry.type === "table");
  assert.equal(segment?.type === "table" && segment.table.rows[1][0], "\\|");
  assert.equal(segment?.type === "table" && segment.table.rows[1][1], "two");

  const trailingEscapedPipe = "A | B\n--- | ---\nx | right \\|";
  const trailingSegment = markdownDocumentSegments(trailingEscapedPipe).find((entry) => entry.type === "table");
  assert.equal(trailingSegment?.type === "table" && trailingSegment.table.rows[1][1], "right |");
});

test("treats the table end as an exclusive document offset", () => {
  const source = "| A |\n| --- |\n| x |\nAfter";
  const tableEnd = source.indexOf("\nAfter");
  assert.equal(tableAt(source, tableEnd), null);
  assert.equal(tableAt(source, source.indexOf("x"))?.columns, 1);
});

test("continues bullet, numbered and task lists with absolute cursor offsets", () => {
  const bullet = continueMarkdownList("Intro\n  - item", "Intro\n  - item".length);
  assert.deepEqual(bullet, { text: "Intro\n  - item\n  - ", cursor: 19 });

  const numbered = continueMarkdownList("9. item", 7);
  assert.deepEqual(numbered, { text: "9. item\n10. ", cursor: 12 });

  const task = continueMarkdownList("- [x] done", 10);
  assert.deepEqual(task, { text: "- [x] done\n- [ ] ", cursor: 17 });
});

test("splits list content at the caret and ends an empty list item", () => {
  const split = continueMarkdownList("- alpha beta", 7);
  assert.deepEqual(split, { text: "- alpha\n-  beta", cursor: 10 });

  const end = continueMarkdownList("- one\n- ", 8);
  assert.deepEqual(end, { text: "- one\n\n", cursor: 7 });

  const beforeContent = continueMarkdownList("- one\n- \nAfter", 8);
  assert.deepEqual(beforeContent, { text: "- one\n\nAfter", cursor: 7 });
});

test("does not continue selections, prose or list-looking text in code fences", () => {
  assert.equal(continueMarkdownList("plain text", 10), null);
  assert.equal(continueMarkdownList("- selected", 2, 7), null);
  const fenced = "```\n- code\n```";
  assert.equal(continueMarkdownList(fenced, fenced.indexOf("code") + 4), null);
});
