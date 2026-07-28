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
};

export type TableAction = "add-row" | "add-column" | "remove-row" | "remove-column";

export type EditableMarkdownTable = {
  start: number;
  end: number;
  rowIndex: number;
  columnIndex: number;
  rows: string[][];
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

  contentRows[row][column] = encodeTableCell(value);
  const renderedLines = renderParsedTable(table, contentRows, table.rows[1]);
  const line = row === 0 ? 0 : row + 1;
  const cursorInTable = cellCursorOffset(renderedLines, line, column) + contentRows[row][column].length;
  return replaceParsedTable(text, table, renderedLines, cursorInTable);
}

export function tableCellCursor(text: string, cursor: number, row: number, column: number) {
  const table = parseTableAt(text, cursor);
  if (!table) return null;
  const contentRows = tableContentRows(table);
  if (row < 0 || row >= contentRows.length || column < 0 || column >= table.rows[0].length) return null;
  const renderedLines = renderParsedTable(table, contentRows, table.rows[1]);
  const line = row === 0 ? 0 : row + 1;
  return table.start + cellCursorOffset(renderedLines, line, column);
}

export function editTable(text: string, cursor: number, action: TableAction): TextEdit | null {
  const table = parseTableAt(text, cursor);
  if (!table) return null;

  const contentRows = tableContentRows(table);
  const separator = [...table.rows[1]];
  let targetRow = table.rowIndex > 1 ? table.rowIndex - 1 : 0;
  let targetColumn = table.columnIndex;

  if (action === "add-row") {
    const insertAt = Math.min(Math.max(targetRow + 1, 1), contentRows.length);
    contentRows.splice(insertAt, 0, Array(table.rows[0].length).fill(""));
    targetRow = insertAt;
  } else if (action === "add-column") {
    for (const row of contentRows) row.splice(targetColumn + 1, 0, "");
    separator.splice(targetColumn + 1, 0, "---");
    targetColumn += 1;
  } else if (action === "remove-row") {
    if (contentRows.length <= 2 || targetRow === 0) return null;
    contentRows.splice(targetRow, 1);
    targetRow = Math.max(1, targetRow - 1);
  } else {
    if (contentRows[0].length <= 1) return null;
    for (const row of contentRows) row.splice(targetColumn, 1);
    separator.splice(targetColumn, 1);
    targetColumn = Math.max(0, targetColumn - 1);
  }

  const renderedLines = renderParsedTable(table, contentRows, separator);
  const rowForCursor = targetRow === 0 ? 0 : Math.min(targetRow + 1, renderedLines.length - 1);
  const relativeCursor = cellCursorOffset(renderedLines, rowForCursor, targetColumn);
  return replaceParsedTable(text, table, renderedLines, relativeCursor);
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
  return {
    start: table.start,
    end: table.end,
    rowIndex: table.rowIndex <= 1 ? 0 : table.rowIndex - 1,
    columnIndex: table.columnIndex,
    rows: tableContentRows(table).map((row) => row.map(decodeTableCell)),
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

function cellCursorOffset(lines: string[], row: number, column: number) {
  let offset = lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0);
  const line = lines[row];
  let seen = 0;
  let escaped = false;
  for (let index = 0; index < line.length; index++) {
    if (escaped) {
      escaped = false;
    } else if (line[index] === "\\") {
      escaped = true;
    } else if (line[index] === "|") {
      if (seen === column) return offset + index + 2;
      seen++;
    }
  }
  return offset + line.length;
}

function tableContentRows(table: ParsedTable) {
  return [table.rows[0], ...table.rows.slice(2)].map((row) => [...row]);
}

function renderParsedTable(table: ParsedTable, contentRows: string[][], separator: string[]) {
  return [
    contentRows[0],
    separator,
    ...contentRows.slice(1),
  ].map((row) => table.indent + renderTableRow(row));
}

function replaceParsedTable(text: string, table: ParsedTable, lines: string[], cursorInTable: number): TextEdit {
  const value = lines.join("\n");
  return {
    text: text.slice(0, table.start) + value + text.slice(table.end),
    cursor: table.start + cursorInTable,
  };
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
