import assert from "node:assert/strict";
import test from "node:test";
import { applySlashCommand, editTable, slashMatchAt, tableAt } from "../src/lib/markdown-editor";

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
