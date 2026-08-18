import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import {
  CollaborativeTextBinding,
  createCollaborativeTableCursor,
  resolveCollaborativeCursor,
} from "../src/lib/collaborative-text";
import {
  applySlashCommand,
  continueMarkdownList,
  editableTableAt,
  editTable,
  editTextIndentation,
  isTableCellMaterialized,
  markdownDocumentSegments,
  replaceHybridTextSegment,
  slashMatchAt,
  tableAt,
  tableCellArrowNavigationTarget,
  tableCellCursor,
  tableCellValueOffset,
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

test("cell edits preserve every byte outside the target raw value", () => {
  const source = String.raw`  A|B
  ---|---
  left \| old | path\\tail  `;
  const value = String.raw`next \ |`;
  const edit = updateTableCell(source, source.indexOf("left"), 1, 0, value);
  assert.ok(edit);
  assert.equal(
    edit.text,
    source.replace(String.raw`left \| old`, String.raw`next \\ \|`),
  );
  assert.equal(edit.cursor, edit.text.indexOf(String.raw`next \\ \|`) + String.raw`next \\ \|`.length);

  const segment = markdownDocumentSegments(edit.text).find((entry) => entry.type === "table");
  assert.equal(segment?.type === "table" && segment.table.rows[1][0], value);
  assert.equal(segment?.type === "table" && segment.table.rows[1][1], String.raw`path\tail`);
});

test("short GFM rows expose read-only placeholders instead of unsafe edits", () => {
  const source = "A|B|C\n---|---|---\nleft |\ntail|middle";
  const segment = markdownDocumentSegments(source).find((entry) => entry.type === "table");
  assert.equal(segment?.type, "table");
  if (segment?.type !== "table") return;
  assert.deepEqual(segment.table.persistedColumns, [3, 1, 2]);
  assert.equal(isTableCellMaterialized(segment.table, 1, 0), true);
  assert.equal(isTableCellMaterialized(segment.table, 1, 1), false);
  assert.equal(isTableCellMaterialized(segment.table, 2, 1), true);
  assert.equal(isTableCellMaterialized(segment.table, 2, 2), false);
  assert.equal(updateTableCell(source, source.indexOf("left"), 1, 2, "unsafe"), null);
  assert.equal(updateTableCell(source, source.indexOf("tail"), 2, 2, "unsafe"), null);

  const existing = updateTableCell(source, source.indexOf("left"), 1, 0, "safe");
  assert.ok(existing);
  assert.equal(existing.text, "A|B|C\n---|---|---\nsafe |\ntail|middle");
});

test("table-cell arrows preserve ordinary horizontal cursor and selection movement", () => {
  const source = "| A | B |\n| --- | --- |\n| one | longer |";
  const table = editableTableAt(source, source.indexOf("one"));
  assert.ok(table);

  assert.equal(tableCellArrowNavigationTarget(table, 1, 0, "ArrowRight", 1, 1, 3), null);
  assert.equal(tableCellArrowNavigationTarget(table, 1, 0, "ArrowRight", 0, 2, 3), null);
  assert.deepEqual(
    tableCellArrowNavigationTarget(table, 1, 0, "ArrowRight", 3, 3, 3),
    { row: 1, column: 1, offset: 0 },
  );
  assert.deepEqual(
    tableCellArrowNavigationTarget(table, 1, 1, "ArrowLeft", 0, 0, 6),
    { row: 1, column: 0, offset: 3 },
  );
  assert.equal(tableCellArrowNavigationTarget(table, 1, 0, "ArrowLeft", 0, 0, 3), null);
});

test("vertical table-cell arrows preserve and clamp the visual caret offset", () => {
  const source = "| Header | B |\n| --- | --- |\n| abc | x |\n| z | longer |";
  const table = editableTableAt(source, source.indexOf("abc"));
  assert.ok(table);

  assert.deepEqual(
    tableCellArrowNavigationTarget(table, 1, 0, "ArrowDown", 2, 2, 3),
    { row: 2, column: 0, offset: 1 },
  );
  assert.deepEqual(
    tableCellArrowNavigationTarget(table, 2, 1, "ArrowUp", 4, 4, 6),
    { row: 1, column: 1, offset: 1 },
  );
  assert.equal(tableCellArrowNavigationTarget(table, 0, 0, "ArrowUp", 0, 0, 6), null);
  assert.equal(tableCellArrowNavigationTarget(table, 2, 0, "ArrowDown", 0, 0, 1), null);
});

test("vertical table-cell arrows skip non-materialized Markdown placeholders", () => {
  const source = "A|B|C\n---|---|---\none|two|three\nshort|\ntail|middle|end";
  const table = editableTableAt(source, source.indexOf("three"));
  assert.ok(table);
  assert.deepEqual(table.persistedColumns, [3, 3, 1, 3]);

  assert.deepEqual(
    tableCellArrowNavigationTarget(table, 1, 2, "ArrowDown", 2, 2, 5),
    { row: 3, column: 2, offset: 2 },
  );
  assert.equal(tableCellArrowNavigationTarget(table, 2, 0, "ArrowRight", 5, 5, 5), null);
});

test("concurrent edits of adjacent non-canonical table cells converge independently", () => {
  const source = "|A|B|\n|---|---|\n|x|y|";
  const seed = new Y.Doc();
  seed.clientID = 500;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);

  const leftDocument = new Y.Doc();
  const rightDocument = new Y.Doc();
  leftDocument.clientID = 501;
  rightDocument.clientID = 502;
  Y.applyUpdate(leftDocument, seedUpdate);
  Y.applyUpdate(rightDocument, seedUpdate);
  const leftBinding = new CollaborativeTextBinding(leftDocument, "markdown");
  const rightBinding = new CollaborativeTextBinding(rightDocument, "markdown");
  leftBinding.viewDocument.clientID = 503;
  rightBinding.viewDocument.clientID = 504;

  const leftEdit = updateTableCell(leftBinding.value, leftBinding.value.indexOf("x"), 1, 0, "LX");
  const rightEdit = updateTableCell(rightBinding.value, rightBinding.value.indexOf("y"), 1, 1, "RY");
  assert.ok(leftEdit && rightEdit);
  const leftUpdate = leftBinding.apply(leftEdit.text);
  const rightUpdate = rightBinding.apply(rightEdit.text);
  assert.ok(leftUpdate && rightUpdate);

  const forward = new Y.Doc();
  const reverse = new Y.Doc();
  Y.applyUpdate(forward, seedUpdate);
  Y.applyUpdate(reverse, seedUpdate);
  Y.applyUpdate(forward, leftUpdate);
  Y.applyUpdate(forward, rightUpdate);
  Y.applyUpdate(reverse, rightUpdate);
  Y.applyUpdate(reverse, leftUpdate);

  const expected = "|A|B|\n|---|---|\n|LX|RY|";
  const forwardText = forward.getText("markdown").toString();
  const reverseText = reverse.getText("markdown").toString();
  assert.equal(forwardText, expected);
  assert.equal(reverseText, expected);
  assert.deepEqual(Array.from(Y.encodeStateVector(forward)), Array.from(Y.encodeStateVector(reverse)));
  assert.equal((forwardText.match(/LX/g) ?? []).length, 1);
  assert.equal((forwardText.match(/RY/g) ?? []).length, 1);

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  leftDocument.destroy();
  rightDocument.destroy();
  forward.destroy();
  reverse.destroy();
});

test("concurrent add-column actions use independent CRDT ranges", () => {
  const source = "| A | B |\n| --- | --- |\n| x | y |";
  const seed = new Y.Doc();
  seed.clientID = 510;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const leftDocument = new Y.Doc();
  const rightDocument = new Y.Doc();
  leftDocument.clientID = 511;
  rightDocument.clientID = 512;
  Y.applyUpdate(leftDocument, seedUpdate);
  Y.applyUpdate(rightDocument, seedUpdate);
  const leftBinding = new CollaborativeTextBinding(leftDocument, "markdown");
  const rightBinding = new CollaborativeTextBinding(rightDocument, "markdown");
  leftBinding.viewDocument.clientID = 513;
  rightBinding.viewDocument.clientID = 514;

  const leftEdit = editTable(leftBinding.value, leftBinding.value.indexOf("A"), "add-column");
  const rightEdit = editTable(rightBinding.value, rightBinding.value.indexOf("B"), "add-column");
  assert.ok(leftEdit?.changes && rightEdit?.changes);
  const leftUpdate = leftBinding.applyChanges(leftEdit.changes);
  const rightUpdate = rightBinding.applyChanges(rightEdit.changes);
  assert.ok(leftUpdate && rightUpdate);

  const forward = new Y.Doc();
  const reverse = new Y.Doc();
  Y.applyUpdate(forward, seedUpdate);
  Y.applyUpdate(reverse, seedUpdate);
  Y.applyUpdate(forward, leftUpdate);
  Y.applyUpdate(forward, rightUpdate);
  Y.applyUpdate(reverse, rightUpdate);
  Y.applyUpdate(reverse, leftUpdate);
  const merged = forward.getText("markdown").toString();
  assert.equal(reverse.getText("markdown").toString(), merged);
  assert.equal(merged.split("\n").length, 3, "the table must not duplicate rows or separators");
  const segment = markdownDocumentSegments(merged).find((entry) => entry.type === "table");
  assert.equal(segment?.type, "table");
  if (segment?.type === "table") {
    assert.equal(segment.table.columns, 4);
    assert.deepEqual(segment.table.rows[0].filter(Boolean), ["A", "B"]);
    assert.deepEqual(segment.table.rows[1].filter(Boolean), ["x", "y"]);
  }
  assert.deepEqual(Array.from(Y.encodeStateVector(forward)), Array.from(Y.encodeStateVector(reverse)));

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  leftDocument.destroy();
  rightDocument.destroy();
  forward.destroy();
  reverse.destroy();
});

test("a concurrent column insertion preserves a neighboring cell edit", () => {
  const source = "| A | B |\n| --- | --- |\n| x | y |";
  const seed = new Y.Doc();
  seed.clientID = 515;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const structureDocument = new Y.Doc();
  const cellDocument = new Y.Doc();
  Y.applyUpdate(structureDocument, seedUpdate);
  Y.applyUpdate(cellDocument, seedUpdate);
  const structureBinding = new CollaborativeTextBinding(structureDocument, "markdown");
  const cellBinding = new CollaborativeTextBinding(cellDocument, "markdown");
  structureBinding.viewDocument.clientID = 516;
  cellBinding.viewDocument.clientID = 517;

  const structureEdit = editTable(structureBinding.value, structureBinding.value.indexOf("A"), "add-column");
  const cellEdit = updateTableCell(cellBinding.value, cellBinding.value.indexOf("y"), 1, 1, "RY");
  assert.ok(structureEdit?.changes && cellEdit);
  const structureUpdate = structureBinding.applyChanges(structureEdit.changes);
  const cellUpdate = cellBinding.apply(cellEdit.text);
  assert.ok(structureUpdate && cellUpdate);
  Y.applyUpdate(structureDocument, cellUpdate);
  Y.applyUpdate(cellDocument, structureUpdate);

  const merged = structureDocument.getText("markdown").toString();
  assert.equal(cellDocument.getText("markdown").toString(), merged);
  const segment = markdownDocumentSegments(merged).find((entry) => entry.type === "table");
  assert.equal(segment?.type, "table");
  if (segment?.type === "table") {
    assert.equal(segment.table.columns, 3);
    assert.deepEqual(segment.table.rows[1], ["x", "", "RY"]);
  }

  structureBinding.destroy();
  cellBinding.destroy();
  seed.destroy();
  structureDocument.destroy();
  cellDocument.destroy();
});

test("relative table cursors follow rows and columns inserted before their cell", () => {
  const source = "| A | B |\n| --- | --- |\n| x | y |\n| p | q |";
  const seed = new Y.Doc();
  seed.clientID = 518;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);

  const columnCursorDocument = new Y.Doc();
  const columnEditorDocument = new Y.Doc();
  Y.applyUpdate(columnCursorDocument, seedUpdate);
  Y.applyUpdate(columnEditorDocument, seedUpdate);
  const columnCursor = createCollaborativeTableCursor(
    columnCursorDocument,
    "markdown",
    0,
    1,
    1,
    source.indexOf("y") + 1,
  );
  const columnBinding = new CollaborativeTextBinding(columnEditorDocument, "markdown");
  columnBinding.viewDocument.clientID = 519;
  const columnEdit = editTable(columnBinding.value, columnBinding.value.indexOf("A"), "add-column");
  assert.ok(columnEdit?.changes);
  const columnUpdate = columnBinding.applyChanges(columnEdit.changes);
  assert.ok(columnUpdate);
  Y.applyUpdate(columnCursorDocument, columnUpdate);
  const resolvedColumnCursor = resolveCollaborativeCursor(columnCursor, columnCursorDocument, "markdown");
  assert.ok(resolvedColumnCursor);
  const actualColumnCell = editableTableAt(
    columnCursorDocument.getText("markdown").toString(),
    resolvedColumnCursor.head,
  );
  assert.equal(resolvedColumnCursor.surface?.column, 1, "surface is only a boundary hint");
  assert.equal(actualColumnCell?.columnIndex, 2, "the relative caret identifies the moved cell");

  const rowCursorDocument = new Y.Doc();
  const rowEditorDocument = new Y.Doc();
  Y.applyUpdate(rowCursorDocument, seedUpdate);
  Y.applyUpdate(rowEditorDocument, seedUpdate);
  const rowCursor = createCollaborativeTableCursor(
    rowCursorDocument,
    "markdown",
    0,
    2,
    1,
    source.indexOf("q") + 1,
  );
  const rowBinding = new CollaborativeTextBinding(rowEditorDocument, "markdown");
  rowBinding.viewDocument.clientID = 523;
  const rowEdit = editTable(rowBinding.value, rowBinding.value.indexOf("x"), "add-row");
  assert.ok(rowEdit?.changes);
  const rowUpdate = rowBinding.applyChanges(rowEdit.changes);
  assert.ok(rowUpdate);
  Y.applyUpdate(rowCursorDocument, rowUpdate);
  const resolvedRowCursor = resolveCollaborativeCursor(rowCursor, rowCursorDocument, "markdown");
  assert.ok(resolvedRowCursor);
  const actualRowCell = editableTableAt(
    rowCursorDocument.getText("markdown").toString(),
    resolvedRowCursor.head,
  );
  assert.equal(resolvedRowCursor.surface?.row, 2, "surface is only a boundary hint");
  assert.equal(actualRowCell?.rowIndex, 3, "the relative caret identifies the moved row");

  columnBinding.destroy();
  rowBinding.destroy();
  seed.destroy();
  columnCursorDocument.destroy();
  columnEditorDocument.destroy();
  rowCursorDocument.destroy();
  rowEditorDocument.destroy();
});

test("a table-end cursor without an outer pipe resolves through the preceding character", () => {
  const source = "A|B\n---|---\nx|y";
  const seed = new Y.Doc();
  seed.clientID = 524;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const cursorDocument = new Y.Doc();
  const editorDocument = new Y.Doc();
  Y.applyUpdate(cursorDocument, seedUpdate);
  Y.applyUpdate(editorDocument, seedUpdate);
  const cursor = createCollaborativeTableCursor(cursorDocument, "markdown", 0, 1, 1, source.length);
  const binding = new CollaborativeTextBinding(editorDocument, "markdown");
  binding.viewDocument.clientID = 525;
  const edit = editTable(binding.value, binding.value.indexOf("A"), "add-column");
  assert.ok(edit?.changes);
  const update = binding.applyChanges(edit.changes);
  assert.ok(update);
  Y.applyUpdate(cursorDocument, update);

  const merged = cursorDocument.getText("markdown").toString();
  const resolved = resolveCollaborativeCursor(cursor, cursorDocument, "markdown");
  assert.ok(resolved);
  assert.equal(resolved.head, merged.length);
  assert.equal(editableTableAt(merged, resolved.head), null);
  const boundaryCell = editableTableAt(merged, resolved.head - 1);
  assert.equal(boundaryCell?.rowIndex, 1);
  assert.equal(boundaryCell?.columnIndex, 2);

  binding.destroy();
  seed.destroy();
  cursorDocument.destroy();
  editorDocument.destroy();
});

test("missing cells reject concurrent writes until standard GFM materialization", () => {
  const source = "A|B|C\n---|---|---\nx|";
  const seed = new Y.Doc();
  seed.clientID = 520;
  seed.getText("markdown").insert(0, source);
  const seedUpdate = Y.encodeStateAsUpdate(seed);
  const leftDocument = new Y.Doc();
  const rightDocument = new Y.Doc();
  Y.applyUpdate(leftDocument, seedUpdate);
  Y.applyUpdate(rightDocument, seedUpdate);
  const leftBinding = new CollaborativeTextBinding(leftDocument, "markdown");
  const rightBinding = new CollaborativeTextBinding(rightDocument, "markdown");
  leftBinding.viewDocument.clientID = 521;
  rightBinding.viewDocument.clientID = 522;

  assert.equal(updateTableCell(leftBinding.value, leftBinding.value.indexOf("x"), 1, 1, "L"), null);
  assert.equal(updateTableCell(rightBinding.value, rightBinding.value.indexOf("x"), 1, 2, "R"), null);
  assert.equal(leftDocument.getText("markdown").toString(), source);
  assert.equal(rightDocument.getText("markdown").toString(), source);

  // A user explicitly materializes the two absent cells in source mode. That
  // coordinated update establishes ordinary, portable GFM/Yjs anchors first.
  const materialized = "A|B|C\n---|---|---\nx|||";
  const materializationUpdate = leftBinding.apply(materialized, "source-mode-materialization");
  assert.ok(materializationUpdate);
  Y.applyUpdate(rightDocument, materializationUpdate);
  rightBinding.sync();
  assert.equal(leftBinding.value, materialized);
  assert.equal(rightBinding.value, materialized);
  const materializedState = Y.encodeStateAsUpdate(leftDocument);

  const leftEdit = updateTableCell(leftBinding.value, leftBinding.value.indexOf("x"), 1, 1, "L");
  const rightEdit = updateTableCell(rightBinding.value, rightBinding.value.indexOf("x"), 1, 2, "R");
  assert.ok(leftEdit && rightEdit);
  const leftUpdate = leftBinding.apply(leftEdit.text);
  const rightUpdate = rightBinding.apply(rightEdit.text);
  assert.ok(leftUpdate && rightUpdate);

  Y.applyUpdate(leftDocument, rightUpdate);
  Y.applyUpdate(rightDocument, leftUpdate);
  assert.equal(leftDocument.getText("markdown").toString(), rightDocument.getText("markdown").toString());
  const merged = leftDocument.getText("markdown").toString();
  assert.equal(merged, "A|B|C\n---|---|---\nx|L|R|");
  assert.equal(merged.includes("\t"), false);
  assert.equal(merged.includes("\u0000"), false);
  const segment = markdownDocumentSegments(merged).find((entry) => entry.type === "table");
  assert.deepEqual(segment?.type === "table" && segment.table.rows[1], ["x", "L", "R"]);
  assert.equal(segment?.type === "table" && segment.table.rows[1].length, 3);
  assert.equal((merged.match(/L/g) ?? []).length, 1);
  assert.equal((merged.match(/R/g) ?? []).length, 1);

  const forward = new Y.Doc();
  const reverse = new Y.Doc();
  Y.applyUpdate(forward, materializedState);
  Y.applyUpdate(reverse, materializedState);
  Y.applyUpdate(forward, leftUpdate);
  Y.applyUpdate(forward, rightUpdate);
  Y.applyUpdate(reverse, rightUpdate);
  Y.applyUpdate(reverse, leftUpdate);
  assert.equal(forward.getText("markdown").toString(), reverse.getText("markdown").toString());
  assert.equal(forward.getText("markdown").toString(), "A|B|C\n---|---|---\nx|L|R|");
  const reverseSegment = markdownDocumentSegments(reverse.getText("markdown").toString())
    .find((entry) => entry.type === "table");
  assert.deepEqual(reverseSegment?.type === "table" && reverseSegment.table.rows[1], ["x", "L", "R"]);

  leftBinding.destroy();
  rightBinding.destroy();
  seed.destroy();
  leftDocument.destroy();
  rightDocument.destroy();
  forward.destroy();
  reverse.destroy();
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

test("maps decoded header and body cell offsets to absolute Markdown cursors", () => {
  const source = "Intro\n| Header | Other |\n| --- | --- |\n| body | tail |\nAfter";
  const tableStart = source.indexOf("| Header");
  const headerStart = source.indexOf("Header");
  const bodyStart = source.indexOf("tail");

  assert.equal(tableCellCursor(source, tableStart, 0, 0), headerStart);
  assert.equal(tableCellCursor(source, tableStart, 0, 0, 4), headerStart + 4);
  assert.equal(tableCellCursor(source, tableStart, 1, 1, 3), bodyStart + 3);
  assert.equal(tableCellValueOffset(source, headerStart + 4, 0, 0), 4);
  assert.equal(tableCellValueOffset(source, bodyStart + 3, 1, 1), 3);
});

test("maps visual offsets across escaped pipes and backslashes", () => {
  const source = "| A\\\\B\\|C | Plain |\n| --- | --- |\n| body | tail |";
  const tableStart = source.indexOf("| A");
  const cellStart = source.indexOf("A");
  const encodedOffsets = [0, 1, 3, 4, 6, 7];

  encodedOffsets.forEach((encodedOffset, decodedOffset) => {
    const markdownOffset = cellStart + encodedOffset;
    assert.equal(tableCellCursor(source, tableStart, 0, 0, decodedOffset), markdownOffset);
    assert.equal(tableCellValueOffset(source, markdownOffset, 0, 0), decodedOffset);
  });
  assert.equal(tableCellValueOffset(source, cellStart + 2, 0, 0), 1);
  assert.equal(tableCellValueOffset(source, cellStart + 5, 0, 0), 3);
});

test("round-trips every visual caret position through encoded Markdown cells", () => {
  const template = "| A | B |\n| --- | --- |\n| body | tail |";
  const values = ["", "plain", "|", "\\", "left \\| right", "emoji \u{1F600} | slash \\"];

  for (const value of values) {
    const edit = updateTableCell(template, template.indexOf("body"), 1, 0, value);
    assert.ok(edit);
    for (let valueOffset = 0; valueOffset <= value.length; valueOffset++) {
      const markdownOffset = tableCellCursor(edit.text, edit.text.indexOf("| A"), 1, 0, valueOffset);
      assert.notEqual(markdownOffset, null);
      assert.equal(tableCellValueOffset(edit.text, markdownOffset!, 1, 0), valueOffset);
    }
  }
});

test("clamps table-cell offsets and rejects invalid table coordinates", () => {
  const source = "| A | B |\n| --- | --- |\n| body | tail |\nAfter";
  const tableStart = source.indexOf("| A");
  const bodyStart = source.indexOf("body");
  const bodyEnd = bodyStart + "body".length;

  assert.equal(tableCellCursor(source, tableStart, 1, 0, -10), bodyStart);
  assert.equal(tableCellCursor(source, tableStart, 1, 0, 10), bodyEnd);
  assert.equal(tableCellValueOffset(source, tableStart, 1, 0), 0);
  assert.equal(tableCellValueOffset(source, source.indexOf("tail"), 1, 0), 4);
  assert.equal(tableCellCursor(source, tableStart, -1, 0), null);
  assert.equal(tableCellCursor(source, tableStart, 1, 2), null);
  assert.equal(tableCellValueOffset(source, tableStart, 2, 0), null);
  assert.equal(tableCellValueOffset(source, source.length, 1, 0), null);
});

test("uses persisted GFM spacing when mapping visual table cursors", () => {
  const source = "Before\n  Name|Value\n  --- | ---\n  alpha| beta\nAfter";
  const tableStart = source.indexOf("Name");
  const valueStart = source.indexOf("beta");
  assert.equal(tableCellCursor(source, tableStart, 1, 1, 2), valueStart + 2);
  assert.equal(tableCellValueOffset(source, valueStart + 2, 1, 1), 2);
  assert.equal(tableCellCursor(source, tableStart, 1, 1, 4), valueStart + 4);
  assert.equal(tableCellValueOffset(source, valueStart + 4, 1, 1), 4);
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

test("captures Tab as a two-space insertion at a text caret", () => {
  const edit = editTextIndentation("alpha", 2);
  assert.equal(edit.text, "al  pha");
  assert.equal(edit.selectionStart, 4);
  assert.equal(edit.selectionEnd, 4);
  assert.deepEqual(edit.changes, [{ start: 2, end: 2, value: "  " }]);
});

test("indents every covered line while preserving the logical selection", () => {
  const source = "one\ntwo\nthree";
  const edit = editTextIndentation(source, 1, 8);
  assert.equal(edit.text, "  one\n  two\nthree");
  assert.equal(edit.selectionStart, 3);
  assert.equal(edit.selectionEnd, 12);
  assert.deepEqual(edit.changes, [
    { start: 0, end: 0, value: "  " },
    { start: 4, end: 4, value: "  " },
  ]);
});

test("Shift+Tab outdents selected lines with spaces or tabs", () => {
  const source = "  one\n\ttwo\n three";
  const edit = editTextIndentation(source, 0, source.length, true);
  assert.equal(edit.text, "one\ntwo\nthree");
  assert.equal(edit.selectionStart, 0);
  assert.equal(edit.selectionEnd, edit.text.length);
  assert.deepEqual(edit.changes, [
    { start: 0, end: 2, value: "" },
    { start: 6, end: 7, value: "" },
    { start: 11, end: 12, value: "" },
  ]);
});

test("Shift+Tab returns no edit when focus should move out of an unindented line", () => {
  const edit = editTextIndentation("plain", 3, 3, true);
  assert.equal(edit.text, "plain");
  assert.equal(edit.selectionStart, 3);
  assert.equal(edit.selectionEnd, 3);
  assert.deepEqual(edit.changes, []);
});

test("Tab indentation in empty hybrid boundaries stays separated from the table", () => {
  const table = "| A |\n| --- |\n| one |";
  const segments = markdownDocumentSegments(table);
  const before = segments[0];
  const after = segments[segments.length - 1];
  assert.equal(before.type, "text");
  assert.equal(after.type, "text");
  if (before.type !== "text" || after.type !== "text") return;

  const beforeEdit = replaceHybridTextSegment(table, before, "  ", 2);
  assert.equal(beforeEdit.text, `  \n${table}`);
  assert.equal(beforeEdit.cursor, 2);

  const afterEdit = replaceHybridTextSegment(table, after, "  ", table.length + 2);
  assert.equal(afterEdit.text, `${table}\n  `);
  assert.equal(afterEdit.cursor, table.length + 3);
});
