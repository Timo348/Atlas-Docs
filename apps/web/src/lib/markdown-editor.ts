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

type ParsedTable = {
  start: number;
  end: number;
  lines: string[];
  rows: string[][];
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

export function editTable(text: string, cursor: number, action: TableAction): TextEdit | null {
  const table = parseTableAt(text, cursor);
  if (!table) return null;

  const dataRows = table.rows.filter((_, index) => index !== 1);
  let targetRow = table.rowIndex > 1 ? table.rowIndex - 1 : 1;
  let targetColumn = table.columnIndex;

  if (action === "add-row") {
    const insertAt = Math.min(Math.max(targetRow + 1, 1), dataRows.length);
    dataRows.splice(insertAt, 0, Array(table.rows[0].length).fill(""));
    targetRow = insertAt;
  } else if (action === "add-column") {
    for (const row of dataRows) row.splice(targetColumn + 1, 0, "");
    targetColumn += 1;
  } else if (action === "remove-row") {
    if (dataRows.length <= 2 || table.rowIndex <= 1) return null;
    dataRows.splice(targetRow, 1);
    targetRow = Math.max(1, targetRow - 1);
  } else {
    if (dataRows[0].length <= 1) return null;
    for (const row of dataRows) row.splice(targetColumn, 1);
    targetColumn = Math.max(0, targetColumn - 1);
  }

  const rows = [
    dataRows[0],
    Array(dataRows[0].length).fill("---"),
    ...dataRows.slice(1),
  ];
  const renderedLines = rows.map(renderTableRow);
  const value = renderedLines.join("\n");
  const rowForCursor = action === "add-row" ? targetRow + 1 : Math.min(targetRow + 1, renderedLines.length - 1);
  const relativeCursor = cellCursorOffset(renderedLines, rowForCursor, targetColumn);
  return {
    text: text.slice(0, table.start) + value + text.slice(table.end),
    cursor: table.start + relativeCursor,
  };
}

function parseTableAt(text: string, cursor: number): ParsedTable | null {
  const lines = text.split("\n");
  let offset = 0;
  let currentLine = 0;
  for (let index = 0; index < lines.length; index++) {
    const end = offset + lines[index].length;
    if (cursor >= offset && cursor <= end + (index < lines.length - 1 ? 1 : 0)) {
      currentLine = index;
      break;
    }
    offset = end + 1;
  }

  let first = currentLine;
  let last = currentLine;
  while (first > 0 && isTableRow(lines[first - 1])) first--;
  while (last + 1 < lines.length && isTableRow(lines[last + 1])) last++;
  const block = lines.slice(first, last + 1);
  if (block.length < 3 || !isSeparatorRow(block[1])) return null;

  const rows = block.map(parseTableRow);
  const columns = rows[0].length;
  if (columns < 1 || rows.some((row) => row.length !== columns)) return null;

  const start = lines.slice(0, first).reduce((sum, line) => sum + line.length + 1, 0);
  const currentLineStart = lines.slice(0, currentLine).reduce((sum, line) => sum + line.length + 1, 0);
  const inLine = Math.max(0, cursor - currentLineStart);
  const columnIndex = columnAt(lines[currentLine], inLine, columns);
  const valueLength = block.join("\n").length;

  return {
    start,
    end: start + valueLength,
    lines: block,
    rows,
    rowIndex: currentLine - first,
    columnIndex,
  };
}

function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && parseTableRow(trimmed).length > 0;
}

function isSeparatorRow(line: string) {
  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTableRow(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
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
  let column = 0;
  let escaped = false;
  for (let index = 0; index < Math.min(cursor, line.length); index++) {
    const character = line[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === "|" && index > line.indexOf("|")) column += 1;
  }
  return Math.min(column, columnCount - 1);
}

function cellCursorOffset(lines: string[], row: number, column: number) {
  let offset = lines.slice(0, row).reduce((sum, line) => sum + line.length + 1, 0);
  const line = lines[row];
  let seen = 0;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === "|") {
      if (seen === column) return offset + index + 2;
      seen++;
    }
  }
  return offset + line.length;
}
