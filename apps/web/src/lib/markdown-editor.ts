export type SlashCommandId =
  | "table"
  | "codeblock"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "numbered"
  | "checklist"
  | "quote"
  | "divider"
  | "link"
  | "image";

export type SlashMatch = {
  start: number;
  end: number;
  query: string;
};

export type TextEdit = {
  text: string;
  cursor: number;
  changes?: TextChange[];
};

export type MarkdownInlineStyle = "bold" | "italic" | "strikethrough" | "code" | "link";

export type TextChange = {
  start: number;
  end: number;
  value: string;
};

export type TextIndentationEdit = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  changes: TextChange[];
};

export type TableAction = "add-row" | "add-column" | "remove-row" | "remove-column";
export type TableCellArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";
export type TableCellNavigationTarget = { row: number; column: number; offset: number };

export type EditableMarkdownTable = {
  start: number;
  end: number;
  rowIndex: number;
  columnIndex: number;
  rows: string[][];
  /** Number of cells that actually exist in Markdown for each visual content row. */
  persistedColumns: number[];
  columns: number;
};

export type MarkdownDocumentSegment =
  | { type: "text"; start: number; end: number; value: string }
  | { type: "table"; start: number; end: number; table: EditableMarkdownTable };

type ParsedTable = {
  start: number;
  end: number;
  lines: string[];
  rows: string[][];
  indent: string;
  lineStarts: number[];
  rowIndex: number;
  columnIndex: number;
};

const COMMAND_SNIPPETS: Record<Exclude<SlashCommandId, "image">, (language: "en" | "de") => { value: string; cursorOffset: number }> = {
  table: (language) => {
    const first = language === "de" ? "Spalte 1" : "Column 1";
    const second = language === "de" ? "Spalte 2" : "Column 2";
    const value = `| ${first} | ${second} |\n| --- | --- |\n|  |  |`;
    return { value, cursorOffset: value.length - 4 };
  },
  codeblock: () => ({ value: "```text\n\n```", cursorOffset: 8 }),
  heading1: (language) => {
    const value = `# ${language === "de" ? "Überschrift" : "Headline"}`;
    return { value, cursorOffset: value.length };
  },
  heading2: (language) => {
    const value = `## ${language === "de" ? "Überschrift" : "Headline"}`;
    return { value, cursorOffset: value.length };
  },
  heading3: (language) => {
    const value = `### ${language === "de" ? "Überschrift" : "Headline"}`;
    return { value, cursorOffset: value.length };
  },
  bullet: () => ({ value: "- ", cursorOffset: 2 }),
  numbered: () => ({ value: "1. ", cursorOffset: 3 }),
  checklist: () => ({ value: "- [ ] ", cursorOffset: 6 }),
  quote: () => ({ value: "> ", cursorOffset: 2 }),
  divider: () => ({ value: "---", cursorOffset: 3 }),
  link: (language) => {
    const label = language === "de" ? "Linktext" : "Link text";
    const value = `[${label}](https://example.com)`;
    return { value, cursorOffset: value.length };
  },
};

export function slashMatchAt(text: string, cursor: number): SlashMatch | null {
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const beforeCursor = text.slice(lineStart, cursor);
  const match = beforeCursor.match(/^(\s*)\/([a-z0-9]*)$/i);
  if (!match) return null;
  return {
    start: lineStart + match[1].length,
    end: cursor,
    query: match[2].toLowerCase(),
  };
}

export function applySlashCommand(
  text: string,
  match: SlashMatch,
  command: Exclude<SlashCommandId, "image">,
  language: "en" | "de",
): TextEdit {
  const snippet = COMMAND_SNIPPETS[command](language);
  return {
    text: text.slice(0, match.start) + snippet.value + text.slice(match.end),
    cursor: match.start + snippet.cursorOffset,
  };
}

export function replaceRange(text: string, start: number, end: number, value: string): TextEdit {
  return {
    text: text.slice(0, start) + value + text.slice(end),
    cursor: start + value.length,
  };
}

export function tableAt(text: string, cursor: number) {
  const table = parseTableAt(text, cursor);
  return table
    ? { rowIndex: table.rowIndex, columnIndex: table.columnIndex, rows: table.rows.length - 1, columns: table.rows[0].length }
    : null;
}

export function editableTableAt(text: string, cursor: number): EditableMarkdownTable | null {
  const table = parseTableAt(text, cursor);
  return table ? toEditableTable(table) : null;
}

/**
 * Splits a Markdown document without changing a single byte of its persisted
 * representation. Empty text segments are intentional: they provide an input
 * target before/after a table in the hybrid editor.
 */
export function markdownDocumentSegments(text: string): MarkdownDocumentSegment[] {
  const tables = parseTables(text);
  const segments: MarkdownDocumentSegment[] = [];
  let offset = 0;

  for (const table of tables) {
    segments.push({ type: "text", start: offset, end: table.start, value: text.slice(offset, table.start) });
    segments.push({ type: "table", start: table.start, end: table.end, table: toEditableTable(table) });
    offset = table.end;
  }
  segments.push({ type: "text", start: offset, end: text.length, value: text.slice(offset) });
  return segments;
}

export function formatMarkdownInline(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  style: MarkdownInlineStyle,
  language: "en" | "de",
): TextEdit {
  const start = Math.max(0, Math.min(text.length, Math.min(selectionStart, selectionEnd)));
  const end = Math.max(start, Math.min(text.length, Math.max(selectionStart, selectionEnd)));
  const selected = text.slice(start, end);
  const fallback = language === "de" ? "Text" : "Text";
  const label = selected || (style === "link" ? (language === "de" ? "Linktext" : "Link text") : fallback);
  const value = style === "bold"
    ? `**${label}**`
    : style === "italic"
      ? `*${label}*`
      : style === "strikethrough"
        ? `~~${label}~~`
        : style === "code"
          ? `\`${label}\``
          : `[${label}](https://example.com)`;
  return {
    text: text.slice(0, start) + value + text.slice(end),
    cursor: start + value.length,
    changes: [{ start, end, value }],
  };
}

/**
 * Keeps content typed into an empty hybrid-editor boundary separate from the
 * adjacent table. Prefix and suffix newlines are part of the same replacement,
 * so no transient edit can append text to a Markdown table row.
 */
export function replaceHybridTextSegment(
  text: string,
  segment: Extract<MarkdownDocumentSegment, { type: "text" }>,
  value: string,
  cursor: number,
): TextEdit {
  let replacement = value;
  let nextCursor = cursor;
  if (segment.value.length === 0 && value.length > 0) {
    const tables = parseTables(text);
    const previousIsTable = tables.some((table) => table.end === segment.start);
    const nextIsTable = tables.some((table) => table.start === segment.end);
    if (previousIsTable && text[segment.start - 1] !== "\n") {
      replacement = `\n${replacement}`;
      nextCursor += 1;
    }
    if (nextIsTable && text[segment.end] !== "\n") replacement += "\n";
  }
  return {
    text: text.slice(0, segment.start) + replacement + text.slice(segment.end),
    cursor: nextCursor,
  };
}

export function updateTableCell(
  text: string,
  cursor: number,
  row: number,
  column: number,
  value: string,
): TextEdit | null {
  const table = parseTableAt(text, cursor);
  if (!table) return null;
  const contentRows = tableContentRows(table);
  if (row < 0 || row >= contentRows.length || column < 0 || column >= table.rows[0].length) return null;
  const lineIndex = row === 0 ? 0 : row + 1;
  const line = table.lines[lineIndex];
  const cells = tableCellSourceRanges(line);
  const encoded = encodeTableCell(value);
  const existing = cells[column];

  // Normalized placeholder cells have no stable Yjs anchor. Editing them from
  // multiple clients would concatenate competing row suffixes. They must first
  // be materialized as ordinary GFM delimiters in source mode.
  if (!existing) return null;

  // Replacing only the persisted value range keeps every delimiter, space and
  // concurrently edited neighbouring cell outside this Yjs operation.
  return replaceRange(
    text,
    table.lineStarts[lineIndex] + existing.start,
    table.lineStarts[lineIndex] + existing.end,
    encoded,
  );
}

export function isTableCellMaterialized(table: EditableMarkdownTable, row: number, column: number) {
  return Number.isInteger(row)
    && Number.isInteger(column)
    && row >= 0
    && row < table.rows.length
    && column >= 0
    && column < table.columns
    && column < (table.persistedColumns[row] ?? 0);
}

/**
 * Resolves spreadsheet-style arrow movement without taking over ordinary text
 * cursor movement. Horizontal arrows cross a cell boundary only when a collapsed
 * caret is already at that boundary. Vertical arrows preserve the decoded caret
 * offset and skip read-only placeholders from short Markdown rows.
 */
export function tableCellArrowNavigationTarget(
  table: EditableMarkdownTable,
  row: number,
  column: number,
  key: TableCellArrowKey,
  selectionStart: number,
  selectionEnd: number,
  currentValueLength: number,
): TableCellNavigationTarget | null {
  if (
    !isTableCellMaterialized(table, row, column)
    || !Number.isInteger(selectionStart)
    || !Number.isInteger(selectionEnd)
    || !Number.isInteger(currentValueLength)
    || currentValueLength < 0
    || selectionStart < 0
    || selectionStart > currentValueLength
    || selectionEnd < 0
    || selectionEnd > currentValueLength
    || selectionStart !== selectionEnd
  ) return null;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (key === "ArrowLeft" && selectionStart !== 0) return null;
    if (key === "ArrowRight" && selectionStart !== currentValueLength) return null;
    const targetColumn = column + (key === "ArrowLeft" ? -1 : 1);
    if (!isTableCellMaterialized(table, row, targetColumn)) return null;
    return {
      row,
      column: targetColumn,
      offset: key === "ArrowLeft" ? table.rows[row][targetColumn].length : 0,
    };
  }

  const rowStep = key === "ArrowUp" ? -1 : 1;
  for (let targetRow = row + rowStep; targetRow >= 0 && targetRow < table.rows.length; targetRow += rowStep) {
    if (!isTableCellMaterialized(table, targetRow, column)) continue;
    return {
      row: targetRow,
      column,
      offset: Math.min(selectionStart, table.rows[targetRow][column].length),
    };
  }
  return null;
}

export function tableCellCursor(
  text: string,
  cursor: number,
  row: number,
  column: number,
  valueOffset = 0,
) {
  const table = parseTableAt(text, cursor);
  if (!table) return null;
  const contentRows = tableContentRows(table);
  if (row < 0 || row >= contentRows.length || column < 0 || column >= table.rows[0].length) return null;
  const cell = tableCellSource(table, row, column);
  if (!cell) return null;
  return cell.start + encodedOffsetAt(cell.value, valueOffset);
}

/** Maps a persisted Markdown cursor back to an offset in a decoded visual table input. */
export function tableCellValueOffset(text: string, markdownOffset: number, row: number, column: number) {
  const table = parseTableAt(text, markdownOffset)
    ?? parseTables(text).find((candidate) => candidate.end === markdownOffset);
  if (!table) return null;
  const contentRows = tableContentRows(table);
  if (row < 0 || row >= contentRows.length || column < 0 || column >= table.rows[0].length) return null;
  const cell = tableCellSource(table, row, column);
  if (!cell) return null;
  return decodedOffsetAt(cell.value, markdownOffset - cell.start);
}

export function editTable(text: string, cursor: number, action: TableAction): TextEdit | null {
  const table = parseTableAt(text, cursor);
  if (!table) return null;

  const contentRows = tableContentRows(table);
  let targetRow = table.rowIndex > 1 ? table.rowIndex - 1 : 0;
  let targetColumn = table.columnIndex;
  let changes: TextChange[];

  if (action === "add-row") {
    const insertAt = Math.min(Math.max(targetRow + 1, 1), contentRows.length);
    const sourceLine = insertAt + 1;
    const row = table.indent + renderTableRow(Array(table.rows[0].length).fill(""));
    changes = sourceLine < table.lines.length
      ? [{ start: table.lineStarts[sourceLine], end: table.lineStarts[sourceLine], value: `${row}\n` }]
      : [{ start: table.end, end: table.end, value: `\n${row}` }];
    targetRow = insertAt;
  } else if (action === "add-column") {
    changes = table.lines.flatMap((line, lineIndex) => {
      const cell = tableCellSourceRanges(line)[targetColumn];
      if (!cell) return [];
      const insertionAt = table.lineStarts[lineIndex] + cell.rawEnd;
      return [{
        start: insertionAt,
        end: insertionAt,
        value: lineIndex === 1 ? "| --- " : "|  ",
      }];
    });
    targetColumn += 1;
  } else if (action === "remove-row") {
    if (contentRows.length <= 2 || targetRow === 0) return null;
    const sourceLine = targetRow + 1;
    changes = sourceLine + 1 < table.lines.length
      ? [{ start: table.lineStarts[sourceLine], end: table.lineStarts[sourceLine + 1], value: "" }]
      : [{ start: table.lineStarts[sourceLine] - 1, end: table.end, value: "" }];
    targetRow = Math.max(1, targetRow - 1);
  } else {
    if (contentRows[0].length <= 1) return null;
    changes = table.lines.flatMap((line, lineIndex) => {
      const cells = tableCellSourceRanges(line);
      const cell = cells[targetColumn];
      if (!cell) return [];
      if (cells.length === 1) {
        return [{
          start: table.lineStarts[lineIndex] + cell.start,
          end: table.lineStarts[lineIndex] + cell.end,
          value: "",
        }];
      }
      const start = targetColumn === 0 ? cell.rawStart : cells[targetColumn - 1].rawEnd;
      const end = targetColumn === 0 ? cells[1].rawStart : cell.rawEnd;
      return [{
        start: table.lineStarts[lineIndex] + start,
        end: table.lineStarts[lineIndex] + end,
        value: "",
      }];
    });
    targetColumn = Math.max(0, targetColumn - 1);
  }

  const next = applyTextChanges(text, changes);
  const nextCursor = tableCellCursor(next, table.start, targetRow, targetColumn) ?? table.start;
  return { text: next, cursor: nextCursor, changes };
}

/**
 * Implements the list behaviour familiar from Obsidian and other Markdown
 * editors. The edit is deliberately expressed against absolute document
 * offsets so it can also be used by split textareas in hybrid mode.
 */
export function continueMarkdownList(
  text: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): TextEdit | null {
  if (selectionStart !== selectionEnd || isInsideFencedCode(text, selectionStart)) return null;
  const lineStart = text.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", selectionStart);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);

  const task = line.match(/^(\s*)([-+*])\s+\[([ xX])\]\s?(.*)$/);
  const ordered = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  const bullet = line.match(/^(\s*)([-+*])\s+(.*)$/);
  const match = task || ordered || bullet;
  if (!match) return null;

  const body = match[match.length - 1];
  if (body.trim().length === 0) {
    const afterLine = lineEndIndex === -1 ? lineEnd : lineEnd + 1;
    return {
      text: text.slice(0, lineStart) + "\n" + text.slice(afterLine),
      cursor: lineStart + 1,
    };
  }

  let marker: string;
  if (task) marker = `${task[1]}${task[2]} [ ] `;
  else if (ordered) marker = `${ordered[1]}${Number.parseInt(ordered[2], 10) + 1}${ordered[3]} `;
  else marker = `${bullet![1]}${bullet![2]} `;

  return {
    text: text.slice(0, selectionStart) + `\n${marker}` + text.slice(selectionStart),
    cursor: selectionStart + marker.length + 1,
  };
}

/**
 * Applies a two-space editor indentation without replacing the selected text.
 * A caret inserts one indentation level at its current position. A selection
 * indents every covered line, while Shift+Tab removes one leading level. The
 * returned selection tracks the same logical text after the edit.
 */
export function editTextIndentation(
  text: string,
  selectionStart: number,
  selectionEnd = selectionStart,
  outdent = false,
): TextIndentationEdit {
  const start = clampOffset(Math.min(selectionStart, selectionEnd), text.length);
  const end = clampOffset(Math.max(selectionStart, selectionEnd), text.length);
  let changes: TextChange[];

  if (!outdent && start === end) {
    changes = [{ start, end: start, value: "  " }];
  } else {
    const firstLineStart = lineStartAt(text, start);
    const lastSelectedPosition = end > start ? end - 1 : end;
    const lastLineStart = lineStartAt(text, lastSelectedPosition);
    const lineStarts = lineStartsBetween(text, firstLineStart, lastLineStart);
    changes = outdent
      ? lineStarts.flatMap((lineStart) => {
          const width = removableIndentWidth(text, lineStart);
          return width ? [{ start: lineStart, end: lineStart + width, value: "" }] : [];
        })
      : lineStarts.map((lineStart) => ({ start: lineStart, end: lineStart, value: "  " }));
  }

  return {
    text: applyTextChanges(text, changes),
    selectionStart: mapOffsetThroughChanges(start, changes),
    selectionEnd: mapOffsetThroughChanges(end, changes),
    changes,
  };
}

function parseTableAt(text: string, cursor: number): ParsedTable | null {
  const table = parseTables(text).find((candidate) => cursor >= candidate.start && cursor < candidate.end);
  if (!table) return null;

  let rowIndex = 0;
  for (let index = 0; index < table.lineStarts.length; index++) {
    const lineEnd = table.lineStarts[index] + table.lines[index].length;
    if (cursor >= table.lineStarts[index] && cursor <= lineEnd) {
      rowIndex = index;
      break;
    }
  }
  const inLine = Math.max(0, cursor - table.lineStarts[rowIndex]);
  return {
    ...table,
    rowIndex,
    columnIndex: columnAt(table.lines[rowIndex], inLine, table.rows[0].length),
  };
}

function parseTables(text: string): ParsedTable[] {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let nextOffset = 0;
  for (const line of lines) {
    offsets.push(nextOffset);
    nextOffset += line.length + 1;
  }
  const fenced = fencedLineIndexes(lines);
  const tables: ParsedTable[] = [];

  for (let first = 0; first + 1 < lines.length; first++) {
    if (
      fenced.has(first)
      || fenced.has(first + 1)
      || !isTableRow(lines[first])
      || !isSeparatorRow(lines[first + 1])
      || leadingIndent(lines[first]).length > 3
    ) continue;

    const header = parseTableRow(lines[first]);
    const separator = parseTableRow(lines[first + 1]);
    if (header.length !== separator.length) continue;

    let last = first + 1;
    while (
      last + 1 < lines.length
      && !fenced.has(last + 1)
      && isTableRow(lines[last + 1])
    ) last++;

    const block = lines.slice(first, last + 1);
    const start = offsets[first];
    const parsedRows = block.map(parseTableRow);
    tables.push({
      start,
      end: offsets[last] + lines[last].length,
      lines: block,
      rows: [
        parsedRows[0],
        parsedRows[1],
        ...parsedRows.slice(2).map((row) => normalizeTableRow(row, header.length)),
      ],
      indent: leadingIndent(lines[first]),
      lineStarts: offsets.slice(first, last + 1),
      rowIndex: 0,
      columnIndex: 0,
    });
    first = last;
  }

  return tables;
}

function toEditableTable(table: ParsedTable): EditableMarkdownTable {
  const contentLines = [table.lines[0], ...table.lines.slice(2)];
  return {
    start: table.start,
    end: table.end,
    rowIndex: table.rowIndex <= 1 ? 0 : table.rowIndex - 1,
    columnIndex: table.columnIndex,
    rows: tableContentRows(table).map((row) => row.map(decodeTableCell)),
    persistedColumns: contentLines.map((line) => Math.min(table.rows[0].length, tableCellSourceRanges(line).length)),
    columns: table.rows[0].length,
  };
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.includes("|") && parseTableRow(trimmed).length > 0;
}

function isSeparatorRow(line: string) {
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableRow(line: string) {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (hasUnescapedTrailingPipe(trimmed)) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      current += character;
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function renderTableRow(cells: string[]) {
  return `| ${cells.join(" | ")} |`;
}

function applyTextChanges(text: string, changes: readonly TextChange[]) {
  let next = text;
  for (const change of [...changes].sort((left, right) => right.start - left.start)) {
    next = next.slice(0, change.start) + change.value + next.slice(change.end);
  }
  return next;
}

function lineStartAt(text: string, offset: number) {
  return text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function lineStartsBetween(text: string, first: number, last: number) {
  const starts: number[] = [];
  let current = first;
  while (current <= last) {
    starts.push(current);
    const newline = text.indexOf("\n", current);
    if (newline === -1) break;
    current = newline + 1;
  }
  return starts;
}

function removableIndentWidth(text: string, lineStart: number) {
  if (text[lineStart] === "\t") return 1;
  let width = 0;
  while (width < 2 && text[lineStart + width] === " ") width++;
  return width;
}

function mapOffsetThroughChanges(offset: number, changes: readonly TextChange[]) {
  let delta = 0;
  for (const change of [...changes].sort((left, right) => left.start - right.start)) {
    if (change.start === change.end) {
      if (offset < change.start) break;
      delta += change.value.length;
      continue;
    }
    if (offset < change.start) break;
    if (offset <= change.end) return change.start + delta + change.value.length;
    delta += change.value.length - (change.end - change.start);
  }
  return offset + delta;
}

function columnAt(line: string, cursor: number, columnCount: number) {
  const leadingPipe = line.trimStart().startsWith("|");
  let pipes = 0;
  let escaped = false;
  for (let index = 0; index < Math.min(cursor, line.length); index++) {
    const character = line[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === "|") pipes += 1;
  }
  return Math.min(Math.max(0, pipes - (leadingPipe ? 1 : 0)), columnCount - 1);
}

function tableContentRows(table: ParsedTable) {
  return [table.rows[0], ...table.rows.slice(2)].map((row) => [...row]);
}

function tableCellSource(table: ParsedTable, row: number, column: number) {
  const lineIndex = row === 0 ? 0 : row + 1;
  const line = table.lines[lineIndex];
  if (line === undefined) return null;
  const cells = tableCellSourceRanges(line);
  const cell = cells[column];
  if (cell) {
    return {
      start: table.lineStarts[lineIndex] + cell.start,
      value: cell.value,
    };
  }

  return null;
}

function tableCellSourceRanges(line: string) {
  const trimmedStart = line.length - line.trimStart().length;
  const trimmedEnd = line.trimEnd().length;
  let contentStart = trimmedStart;
  let contentEnd = trimmedEnd;
  if (line[contentStart] === "|") contentStart += 1;
  if (contentEnd > contentStart && hasUnescapedTrailingPipe(line.slice(trimmedStart, contentEnd))) contentEnd -= 1;

  const rawRanges: Array<{ start: number; end: number }> = [];
  let start = contentStart;
  let escaped = false;
  for (let index = contentStart; index < contentEnd; index++) {
    const character = line[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      rawRanges.push({ start, end: index });
      start = index + 1;
    }
  }
  rawRanges.push({ start, end: contentEnd });

  return rawRanges.map((range) => {
    const raw = line.slice(range.start, range.end);
    const value = raw.trim();
    if (!value) {
      const anchor = range.start + Math.min(1, raw.length);
      return { start: anchor, end: anchor, rawStart: range.start, rawEnd: range.end, value };
    }
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const start = range.start + leadingWhitespace;
    return { start, end: start + value.length, rawStart: range.start, rawEnd: range.end, value };
  });
}

function encodedOffsetAt(value: string, decodedOffset: number) {
  const target = clampOffset(decodedOffset, decodeTableCell(value).length);
  let encoded = 0;
  let decoded = 0;
  while (encoded < value.length && decoded < target) {
    encoded += isTableCellEscape(value, encoded) ? 2 : 1;
    decoded += 1;
  }
  return encoded;
}

function decodedOffsetAt(value: string, encodedOffset: number) {
  const target = clampOffset(encodedOffset, value.length);
  let encoded = 0;
  let decoded = 0;
  while (encoded < target) {
    const width = isTableCellEscape(value, encoded) ? 2 : 1;
    if (encoded + width > target) break;
    encoded += width;
    decoded += 1;
  }
  return decoded;
}

function isTableCellEscape(value: string, offset: number) {
  return value[offset] === "\\" && (value[offset + 1] === "\\" || value[offset + 1] === "|");
}

function clampOffset(offset: number, maximum: number) {
  if (offset === Number.POSITIVE_INFINITY) return maximum;
  if (!Number.isFinite(offset)) return 0;
  return Math.min(maximum, Math.max(0, Math.trunc(offset)));
}

function decodeTableCell(value: string) {
  let decoded = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    const next = value[index + 1];
    if (character === "\\" && (next === "\\" || next === "|")) {
      decoded += next;
      index++;
    } else {
      decoded += character;
    }
  }
  return decoded;
}

function encodeTableCell(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function normalizeTableRow(row: string[], columns: number) {
  return Array.from({ length: columns }, (_, index) => row[index] ?? "");
}

function hasUnescapedTrailingPipe(value: string) {
  if (!value.endsWith("|")) return false;
  let backslashes = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index--) backslashes++;
  return backslashes % 2 === 0;
}

function leadingIndent(line: string) {
  return line.match(/^\s*/)?.[0] || "";
}

function fencedLineIndexes(lines: string[]) {
  const indexes = new Set<number>();
  let fence: { character: string; length: number } | null = null;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      indexes.add(index);
      if (match && match[1][0] === fence.character && match[1].length >= fence.length) fence = null;
    } else if (match) {
      indexes.add(index);
      fence = { character: match[1][0], length: match[1].length };
    }
  }
  return indexes;
}

function isInsideFencedCode(text: string, cursor: number) {
  const lines = text.split("\n");
  const cursorLine = text.slice(0, cursor).split("\n").length - 1;
  return fencedLineIndexes(lines).has(cursorLine);
}
