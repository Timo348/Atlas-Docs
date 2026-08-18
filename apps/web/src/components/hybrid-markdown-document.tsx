"use client";

import { Code2, Minus, Plus, Table2 } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type RefCallback,
  type SyntheticEvent,
  useLayoutEffect,
  useRef,
} from "react";
import {
  isTableCellMaterialized,
  tableCellArrowNavigationTarget,
  type EditableMarkdownTable,
  type MarkdownDocumentSegment,
  type TableAction,
} from "@/lib/markdown-editor";
import styles from "./hybrid-markdown-document.module.css";

type Translate = (english: string, german: string) => string;

export type CellInputSelection = {
  selectionStart: number;
  selectionEnd: number;
  selectionDirection: "forward" | "backward" | "none";
};

export function HybridModeToggle({
  sourceMode,
  text,
  onToggle,
}: {
  sourceMode: boolean;
  text: Translate;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.modeToggle}
      onClick={onToggle}
      title={sourceMode
        ? text("Edit tables visually", "Tabellen visuell bearbeiten")
        : text("Edit the complete Markdown source", "Vollständigen Markdown-Quelltext bearbeiten")}
    >
      {sourceMode ? <Table2 size={13} /> : <Code2 size={13} />}
      {sourceMode ? text("Visual tables", "Visuelle Tabellen") : text("Edit source", "Quelltext bearbeiten")}
    </button>
  );
}

export function HybridMarkdownDocument({
  segments,
  readOnly,
  activeTableStart,
  text,
  onTextChange,
  onTextKeyDown,
  onTextPaste,
  onTextCursor,
  onTextBlur,
  onCellChange,
  onCellCursor,
  onCellBlur,
  onTableAction,
  destructiveActionsDisabled,
}: {
  segments: MarkdownDocumentSegment[];
  readOnly: boolean;
  activeTableStart: number | null;
  text: Translate;
  onTextChange: (segment: Extract<MarkdownDocumentSegment, { type: "text" }>, value: string, cursor: number) => void;
  onTextKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>, offset: number) => void;
  onTextPaste: (event: ClipboardEvent<HTMLTextAreaElement>, offset: number) => void;
  onTextCursor: (textarea: HTMLTextAreaElement, offset: number) => void;
  onTextBlur: () => void;
  onCellChange: (
    table: EditableMarkdownTable,
    row: number,
    column: number,
    value: string,
    selection: CellInputSelection,
  ) => void;
  onCellCursor: (table: EditableMarkdownTable, row: number, column: number, input: HTMLInputElement) => void;
  onCellBlur: () => void;
  onTableAction: (table: EditableMarkdownTable, action: TableAction) => void;
  destructiveActionsDisabled: boolean;
}) {
  return (
    <div className={styles.document} data-testid="hybrid-markdown-document">
      {segments.map((segment, index) => segment.type === "text" ? (
        <AutoSizeTextarea
          key={`text-${Math.floor(index / 2)}`}
          segment={segment}
          readOnly={readOnly}
          label={text("Markdown text", "Markdown-Text")}
          onChange={onTextChange}
          onKeyDown={onTextKeyDown}
          onPaste={onTextPaste}
          onCursor={onTextCursor}
          onBlur={onTextBlur}
        />
      ) : (
        <EditableTable
          key={`table-${Math.floor(index / 2)}`}
          table={segment.table}
          active={activeTableStart === segment.start}
          readOnly={readOnly}
          text={text}
          onCellChange={onCellChange}
          onCellCursor={onCellCursor}
          onCellBlur={onCellBlur}
          onAction={onTableAction}
          destructiveActionsDisabled={destructiveActionsDisabled}
        />
      ))}
    </div>
  );
}

function AutoSizeTextarea({
  segment,
  readOnly,
  label,
  onChange,
  onKeyDown,
  onPaste,
  onCursor,
  onBlur,
}: {
  segment: Extract<MarkdownDocumentSegment, { type: "text" }>;
  readOnly: boolean;
  label: string;
  onChange: (segment: Extract<MarkdownDocumentSegment, { type: "text" }>, value: string, cursor: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>, offset: number) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>, offset: number) => void;
  onCursor: (textarea: HTMLTextAreaElement, offset: number) => void;
  onBlur: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => resizeTextarea(textareaRef.current), [segment.value]);

  const assignRef: RefCallback<HTMLTextAreaElement> = (textarea) => {
    textareaRef.current = textarea;
    resizeTextarea(textarea);
  };
  const publish = (event: SyntheticEvent<HTMLTextAreaElement>) => onCursor(event.currentTarget, segment.start);

  return (
    <textarea
      ref={assignRef}
      className={styles.markdownText}
      data-markdown-start={segment.start}
      data-markdown-end={segment.end}
      value={segment.value}
      onChange={(event) => onChange(segment, event.target.value, segment.start + event.target.selectionStart)}
      onKeyDown={(event) => onKeyDown(event, segment.start)}
      onPaste={(event) => onPaste(event, segment.start)}
      onSelect={publish}
      onKeyUp={publish}
      onClick={publish}
      onFocus={publish}
      onBlur={onBlur}
      readOnly={readOnly}
      rows={Math.max(1, segment.value.split("\n").length)}
      spellCheck
      aria-label={label}
    />
  );
}

function EditableTable({
  table,
  active,
  readOnly,
  text,
  onCellChange,
  onCellCursor,
  onCellBlur,
  onAction,
  destructiveActionsDisabled,
}: {
  table: EditableMarkdownTable;
  active: boolean;
  readOnly: boolean;
  text: Translate;
  onCellChange: (
    table: EditableMarkdownTable,
    row: number,
    column: number,
    value: string,
    selection: CellInputSelection,
  ) => void;
  onCellCursor: (table: EditableMarkdownTable, row: number, column: number, input: HTMLInputElement) => void;
  onCellBlur: () => void;
  onAction: (table: EditableMarkdownTable, action: TableAction) => void;
  destructiveActionsDisabled: boolean;
}) {
  const navigateCell = (event: KeyboardEvent<HTMLInputElement>, row: number, column: number) => {
    if (
      event.defaultPrevented
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || event.nativeEvent.isComposing
      || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) return;
    const input = event.currentTarget;
    if (input.selectionStart === null || input.selectionEnd === null) return;
    const target = tableCellArrowNavigationTarget(
      table,
      row,
      column,
      event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
      input.selectionStart,
      input.selectionEnd,
      input.value.length,
    );
    if (!target) return;

    const tableElement = input.closest<HTMLElement>("[data-markdown-table-start]");
    const targetInput = tableElement?.querySelector<HTMLInputElement>(
      `input[data-table-row="${target.row}"][data-table-column="${target.column}"]`,
    );
    if (!targetInput || targetInput.disabled) return;

    event.preventDefault();
    targetInput.focus();
    targetInput.setSelectionRange(target.offset, target.offset);
    onCellCursor(table, target.row, target.column, targetInput);
  };

  return (
    <section
      className={`${styles.tableBlock} ${active ? styles.activeTable : ""}`}
      data-markdown-table-start={table.start}
      aria-label={text("Editable Markdown table", "Editierbare Markdown-Tabelle")}
    >
      <div className={styles.tableHeading}>
        <span><Table2 size={14} /> {text("Table", "Tabelle")} · {table.rows.length}×{table.columns}</span>
        <small>{text("Changes are stored as Markdown", "Änderungen werden als Markdown gespeichert")}</small>
      </div>
      <div className={styles.tableScroller}>
        <table>
          <thead>
            <tr>
              {table.rows[0].map((cell, column) => (
                <th key={column}>
                  <CellInput
                    value={cell}
                    row={0}
                    column={column}
                    header
                    materialized={isTableCellMaterialized(table, 0, column)}
                    readOnly={readOnly}
                    text={text}
                    onChange={(value, selection) => onCellChange(table, 0, column, value, selection)}
                    onCursor={(input) => onCellCursor(table, 0, column, input)}
                    onKeyDown={(event) => navigateCell(event, 0, column)}
                    onBlur={onCellBlur}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.slice(1).map((row, bodyIndex) => {
              const rowIndex = bodyIndex + 1;
              return (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td key={column}>
                      <CellInput
                        value={cell}
                        row={rowIndex}
                        column={column}
                        materialized={isTableCellMaterialized(table, rowIndex, column)}
                        readOnly={readOnly}
                        text={text}
                        onChange={(value, selection) => onCellChange(table, rowIndex, column, value, selection)}
                        onCursor={(input) => onCellCursor(table, rowIndex, column, input)}
                        onKeyDown={(event) => navigateCell(event, rowIndex, column)}
                        onBlur={onCellBlur}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className={styles.tableActions} role="toolbar" aria-label={text("Table tools", "Tabellenwerkzeuge")}>
          <button
            type="button"
            aria-label={text("Add row", "Zeile hinzufügen")}
            onClick={() => onAction(table, "add-row")}
          ><Plus size={13} /> {text("Row", "Zeile")}</button>
          <button
            type="button"
            aria-label={text("Add column", "Spalte hinzufügen")}
            onClick={() => onAction(table, "add-column")}
          ><Plus size={13} /> {text("Column", "Spalte")}</button>
          <button
            type="button"
            aria-label={text("Remove row", "Zeile entfernen")}
            disabled={destructiveActionsDisabled}
            title={destructiveActionsDisabled ? text(
              "Remove rows by editing the Markdown source directly.",
              "Entfernen Sie Zeilen direkt im Markdown-Quelltext.",
            ) : undefined}
            onClick={() => onAction(table, "remove-row")}
          ><Minus size={13} /> {text("Row", "Zeile")}</button>
          <button
            type="button"
            aria-label={text("Remove column", "Spalte entfernen")}
            disabled={destructiveActionsDisabled}
            title={destructiveActionsDisabled ? text(
              "Remove columns by editing the Markdown source directly.",
              "Entfernen Sie Spalten direkt im Markdown-Quelltext.",
            ) : undefined}
            onClick={() => onAction(table, "remove-column")}
          ><Minus size={13} /> {text("Column", "Spalte")}</button>
        </div>
      )}
    </section>
  );
}

function CellInput({
  value,
  row,
  column,
  header = false,
  materialized,
  readOnly,
  text,
  onChange,
  onCursor,
  onKeyDown,
  onBlur,
}: {
  value: string;
  row: number;
  column: number;
  header?: boolean;
  materialized: boolean;
  readOnly: boolean;
  text: Translate;
  onChange: (value: string, selection: CellInputSelection) => void;
  onCursor: (input: HTMLInputElement) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onBlur: () => void;
}) {
  const publish = (event: SyntheticEvent<HTMLInputElement>) => onCursor(event.currentTarget);
  return (
    <input
      className={header ? styles.headerInput : styles.cellInput}
      value={value}
      disabled={!materialized}
      readOnly={readOnly || !materialized}
      title={!materialized ? text(
        "This cell is missing from the Markdown source. Switch to source mode to create it.",
        "Diese Zelle fehlt im Markdown-Quelltext. Zum Erstellen in den Quellmodus wechseln.",
      ) : undefined}
      onChange={(event) => {
        const input = event.currentTarget;
        onChange(input.value, {
          selectionStart: input.selectionStart ?? input.value.length,
          selectionEnd: input.selectionEnd ?? input.value.length,
          selectionDirection: input.selectionDirection ?? "none",
        });
      }}
      onSelect={publish}
      onKeyUp={publish}
      onClick={publish}
      onFocus={publish}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      data-table-row={row}
      data-table-column={column}
      aria-label={text(
        `${header ? "Header" : "Cell"} row ${row + 1}, column ${column + 1}`,
        `${header ? "Kopfzelle" : "Zelle"} Zeile ${row + 1}, Spalte ${column + 1}`,
      )}
    />
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "0";
  textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
}
