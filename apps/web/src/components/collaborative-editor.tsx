"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  Bold, Code2, Download, Eye, FileText, History, ImagePlus, Italic, Link2, LoaderCircle, Minus,
  Pencil, Plus, RotateCcw, Save as SaveIcon, Share2, Strikethrough, Table2, Users, X,
} from "lucide-react";
import {
  type ClipboardEvent, type KeyboardEvent, type ReactNode, type RefObject,
  useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import ReactMarkdown, { type Components as MarkdownComponents } from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { CollaborativeCanvas } from "@/components/collaborative-canvas";
import { CollaborativeMermaid } from "@/components/collaborative-mermaid";
import { CollaborativeTodoBoard } from "@/components/collaborative-todo-board";
import {
  HybridMarkdownDocument,
  HybridModeToggle,
  type CellInputSelection,
} from "@/components/hybrid-markdown-document";
import { LatexPreview } from "@/components/latex-preview";
import { usePreferences } from "@/components/preferences-provider";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { PageShareDialog } from "@/components/page-share-dialog";
import { UnsupportedFileViewer } from "@/components/unsupported-file-viewer";
import {
  applySlashCommand, continueMarkdownList, editableTableAt, editTable, editTextIndentation, formatMarkdownInline, markdownDocumentSegments,
  replaceHybridTextSegment,
  slashMatchAt, tableCellCursor, tableCellValueOffset, updateTableCell,
  type EditableMarkdownTable, type MarkdownDocumentSegment, type MarkdownInlineStyle, type SlashCommandId, type SlashMatch,
  type TableAction, type TextEdit,
} from "@/lib/markdown-editor";
import { apiErrorMessage } from "@/lib/api-errors";
import {
  applyCollaborationPermission,
  collaborationIsReadOnly,
  completeInitialCollaborationSync,
  createCollaborationAccessState,
} from "@/lib/collaboration-access";
import {
  CollaborativeTextBinding,
  createCollaborativeCursor,
  createCollaborativeTextCursor,
  createCollaborativeTableCursor,
  distinctCollaborativeUsers,
  parseCollaborativePresenceStates,
  resolveCollaborativeCursor,
  type CollaborativeCursor,
  type ResolvedCollaborativeCursorSurface,
} from "@/lib/collaborative-text";
import { createVisibleSnapshot, restoreVisibleSnapshot } from "@/lib/version-snapshot";
import { sharedPageImageUrl } from "@/lib/shared-page-images";
import { downloadableFileName } from "@/lib/page-file";
import { serializeTodoBoard } from "@/lib/todo-board";

type PageItem = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  format: "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
  fileMime?: string | null;
  fileSize?: number | null;
};
type Tab = "write" | "preview" | "canvas" | "diagram" | "todo";
type Connection = "connecting" | "connected" | "disconnected";
type PageVersion = {
  id: string;
  version: number;
  title: string;
  author: string;
  restoredFromVersion: number | null;
  createdAt: string;
};
type VisibleCursor = {
  clientId: number;
  id: string;
  name: string;
  color: string;
  hasAvatar: boolean;
  avatarVersion: number;
  cursor: number | null;
  surface?: ResolvedCollaborativeCursorSurface;
};
type LocalCursorSurface = { kind: "text" } | {
  kind: "table-cell";
  tableStart: number;
  row: number;
  column: number;
};
type PublicShareAccess = { token: string; permission: "VIEW" | "EDIT" };
type EditorProps = {
  page: PageItem;
  headerCenter?: ReactNode;
  publicShare?: PublicShareAccess;
  canManageShares?: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MEMBER";
    hasAvatar: boolean;
    avatarVersion: number;
  };
};

// React development mode replays effects (setup -> cleanup -> setup). A lease
// lets the second setup cancel destruction of the same memoized documents while
// still disposing superseded page documents deterministically after unmount.
const collaborationResourceOwners = new WeakMap<Y.Doc, object>();

const SLASH_COMMANDS: { id: SlashCommandId; title: [string, string]; description: [string, string] }[] = [
  { id: "table", title: ["Table", "Tabelle"], description: ["Insert an expandable table", "Erweiterbare Tabelle einfügen"] },
  { id: "codeblock", title: ["Code block", "Codeblock"], description: ["Fenced code section", "Abgegrenzten Codebereich einfügen"] },
  { id: "image", title: ["Image", "Bild"], description: ["Upload and insert an image", "Bild hochladen und einfügen"] },
  { id: "heading1", title: ["Heading 1", "Überschrift 1"], description: ["Large section heading", "Große Abschnittsüberschrift"] },
  { id: "heading2", title: ["Heading 2", "Überschrift 2"], description: ["Medium section heading", "Mittlere Abschnittsüberschrift"] },
  { id: "heading3", title: ["Heading 3", "Überschrift 3"], description: ["Small section heading", "Kleine Abschnittsüberschrift"] },
  { id: "bullet", title: ["Bullet list", "Aufzählung"], description: ["Start a bullet list", "Aufzählung beginnen"] },
  { id: "numbered", title: ["Numbered list", "Nummerierte Liste"], description: ["Start a numbered list", "Nummerierte Liste beginnen"] },
  { id: "checklist", title: ["Checklist", "Checkliste"], description: ["Insert a task item", "Aufgabe einfügen"] },
  { id: "quote", title: ["Quote", "Zitat"], description: ["Insert a block quote", "Blockzitat einfügen"] },
  { id: "divider", title: ["Divider", "Trennlinie"], description: ["Insert a horizontal rule", "Horizontale Linie einfügen"] },
  { id: "link", title: ["Link", "Link"], description: ["Insert a Markdown link", "Markdown-Link einfügen"] },
];

export function CollaborativeEditor(props: EditorProps) {
  if (props.page.format === "FILE") {
    return <UnsupportedFileViewer page={props.page} headerCenter={props.headerCenter} publicShare={props.publicShare} />;
  }
  return <CollaborativeDocumentEditor {...props} />;
}

function CollaborativeDocumentEditor({
  page,
  user,
  headerCenter,
  publicShare,
  canManageShares = false,
}: EditorProps) {
  const { preferences, text } = usePreferences();
  const ydoc = useMemo(() => new Y.Doc(), [page.id]);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);
  const textBinding = useMemo(() => new CollaborativeTextBinding(ydoc, "markdown"), [ydoc]);
  const [{ markdown, revision: documentRevision }, setDocumentState] = useState({
    markdown: textBinding.value,
    revision: 0,
  });
  const [tab, setTab] = useState<Tab>(
    page.format === "CANVAS"
      ? "canvas"
      : page.format === "MERMAID" || page.format === "GANTT"
        ? "diagram"
      : page.format === "TODO"
        ? "todo"
      : page.format === "TEXT"
        ? "write"
      : publicShare?.permission === "VIEW" ? "preview" : preferences.defaultEditorView,
  );
  const [status, setStatus] = useState<Connection>("connecting");
  const [awarenessStates, setAwarenessStates] = useState<unknown[]>([]);
  const [scrollRevision, setScrollRevision] = useState(0);
  const [title, setTitle] = useState(page.title);
  const [collaborationAccess, setCollaborationAccess] = useState(
    () => createCollaborationAccessState(page.id),
  );
  const readOnly = collaborationIsReadOnly(collaborationAccess, page.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionNotice, setVersionNotice] = useState("");
  useDialogEscape(
    () => setHistoryOpen(false),
    historyLoading || versionBusy,
    historyOpen,
  );
  const [cursorIndex, setCursorIndex] = useState(0);
  const [localCursorMarkerVisible, setLocalCursorMarkerVisible] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [editorNotice, setEditorNotice] = useState("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [tableSourceMode, setTableSourceMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorStageRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageMatchRef = useRef<SlashMatch | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const localCursorRef = useRef<CollaborativeCursor | null>(null);
  const restoreEditorFocusRef = useRef(false);
  const savedTitleRef = useRef(page.title);

  useEffect(() => setTableSourceMode(false), [page.id]);

  useEffect(() => {
    let active = true;
    let provider: HocuspocusProvider | undefined;
    let publicPermissionRefresh: ReturnType<typeof setInterval> | undefined;
    setCollaborationAccess(createCollaborationAccessState(page.id));
    const updateText = () => {
      if (!active) return;
      textBinding.sync("rendered-collaboration-state");
      const stage = editorStageRef.current;
      const focused = document.activeElement;
      if (
        stage
        && (focused instanceof HTMLTextAreaElement || focused instanceof HTMLInputElement)
        && stage.contains(focused)
      ) restoreEditorFocusRef.current = true;
      setDocumentState((current) => ({
        markdown: textBinding.value,
        revision: current.revision + 1,
      }));
    };
    ytext.observe(updateText);
    updateText();

    const color = userColor(user.id);
    async function connect() {
      const configResponse = await fetch("/api/runtime-config");
      if (!configResponse.ok) throw new Error("Collaboration configuration unavailable.");
      const config = await configResponse.json() as { collaborationUrl: string };
      if (!active) return;
      provider = new HocuspocusProvider({
        url: config.collaborationUrl,
        name: `page:${page.id}`,
        document: ydoc,
        token: async () => {
          const response = publicShare
            ? await fetch("/api/public/collaboration-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: publicShare.token }),
            })
            : await fetch(`/api/collaboration-token?pageId=${encodeURIComponent(page.id)}`);
          if (!response.ok) throw new Error("Collaboration token unavailable.");
          const data = await response.json();
          if (active) {
            setCollaborationAccess((current) => applyCollaborationPermission(
              current,
              page.id,
              data.readOnly === true,
            ));
          }
          return data.token;
        },
        onStatus: ({ status: nextStatus }) => {
          if (active) setStatus(nextStatus as Connection);
        },
        onSynced: ({ state: synced }) => {
          if (active && synced) {
            setCollaborationAccess((current) => completeInitialCollaborationSync(current, page.id));
          }
        },
        onAwarenessUpdate: ({ states }) => {
          const trustedStates = provider?.awareness?.getStates();
          if (active) setAwarenessStates(trustedStates ? Array.from(trustedStates.entries()) : states);
        },
        onAuthenticationFailed: () => {
          if (active) setStatus("disconnected");
        },
      });
      providerRef.current = provider;
      provider.setAwarenessField("user", {
        id: user.id,
        name: user.name,
        color,
        hasAvatar: user.hasAvatar,
        avatarVersion: user.avatarVersion,
      });
      if (publicShare) {
        publicPermissionRefresh = setInterval(() => {
          provider?.disconnect();
          provider?.connect();
        }, 60 * 1000);
      }
    }
    void connect().catch(() => active && setStatus("disconnected"));

    return () => {
      active = false;
      ytext.unobserve(updateText);
      providerRef.current = null;
      if (publicPermissionRefresh) clearInterval(publicPermissionRefresh);
      provider?.destroy();
    };
  }, [page.id, publicShare, user.id, user.name, user.hasAvatar, user.avatarVersion, textBinding, ydoc, ytext]);

  useEffect(() => {
    const owner = {};
    collaborationResourceOwners.set(ydoc, owner);
    return () => {
      queueMicrotask(() => {
        if (collaborationResourceOwners.get(ydoc) !== owner) return;
        collaborationResourceOwners.delete(ydoc);
        textBinding.destroy();
        ydoc.destroy();
      });
    };
  }, [textBinding, ydoc]);

  useLayoutEffect(() => {
    const cursor = localCursorRef.current;
    if (!cursor) return;
    const resolved = resolveCollaborativeCursor(cursor, textBinding.viewDocument, "markdown");
    if (!resolved) return;

    setCursorIndex(resolved.head);
    if (cursor.index !== resolved.head) {
      const updatedCursor = { ...cursor, index: resolved.head };
      localCursorRef.current = updatedCursor;
      providerRef.current?.setAwarenessField("cursor", updatedCursor);
    }

    const stage = editorStageRef.current;
    if (!stage) return;
    const active = document.activeElement;
    const activeEditor = (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && stage.contains(active)
      ? active
      : null;
    const shouldRestoreFocus = activeEditor !== null || restoreEditorFocusRef.current;
    restoreEditorFocusRef.current = false;
    if (!shouldRestoreFocus) return;
    const direction = resolved.anchor > resolved.head ? "backward" : "forward";

    const textareas = Array.from(stage.querySelectorAll<HTMLTextAreaElement>("textarea[data-markdown-start]"));
    if (resolved.surface?.kind === "text" || (!resolved.surface && activeEditor instanceof HTMLTextAreaElement)) {
      const textarea = textareas.find((candidate) => {
        const offset = Number(candidate.dataset.markdownStart || 0);
        const end = Number(candidate.dataset.markdownEnd || textBinding.value.length);
        return resolved.anchor >= offset && resolved.anchor <= end && resolved.head >= offset && resolved.head <= end;
      }) ?? (activeEditor instanceof HTMLTextAreaElement ? activeEditor : null);
      if (textarea) {
        const offset = Number(textarea.dataset.markdownStart || 0);
        const selectionStart = Math.min(resolved.anchor, resolved.head) - offset;
        const selectionEnd = Math.max(resolved.anchor, resolved.head) - offset;
        if (
          textarea.selectionStart !== selectionStart
          || textarea.selectionEnd !== selectionEnd
          || textarea.selectionDirection !== direction
        ) textarea.setSelectionRange(selectionStart, selectionEnd, direction);
        textarea.focus({ preventScroll: true });
        return;
      }
    }

    const targetTable = !tableSourceMode ? editableTableAt(textBinding.value, resolved.head) : null;
    if (targetTable) {
      const input = stage.querySelector<HTMLInputElement>(
        `[data-markdown-table-start="${targetTable.start}"] `
        + `[data-table-row="${targetTable.rowIndex}"][data-table-column="${targetTable.columnIndex}"]`,
      );
      const anchor = tableCellValueOffset(textBinding.value, resolved.anchor, targetTable.rowIndex, targetTable.columnIndex);
      const head = tableCellValueOffset(textBinding.value, resolved.head, targetTable.rowIndex, targetTable.columnIndex);
      if (input && anchor !== null && head !== null) {
        const selectionStart = Math.min(anchor, head);
        const selectionEnd = Math.max(anchor, head);
        if (
          input.selectionStart !== selectionStart
          || input.selectionEnd !== selectionEnd
          || input.selectionDirection !== direction
        ) input.setSelectionRange(selectionStart, selectionEnd, direction);
        input.focus({ preventScroll: true });
        return;
      }
    }

    // At the exclusive end of a table there is no parseable current cell. The
    // relative table start plus surface coordinates disambiguate that boundary.
    if (!targetTable && resolved.surface?.kind === "table-cell") {
      const boundaryTable = editableTableAt(
        textBinding.value,
        Math.max(resolved.surface.tableStart, resolved.head - 1),
      );
      const tableStart = resolved.surface.tableStart;
      const row = boundaryTable?.start === tableStart ? boundaryTable.rowIndex : resolved.surface.row;
      const column = boundaryTable?.start === tableStart ? boundaryTable.columnIndex : resolved.surface.column;
      const input = stage.querySelector<HTMLInputElement>(
        `[data-markdown-table-start="${tableStart}"] `
        + `[data-table-row="${row}"][data-table-column="${column}"]`,
      );
      const anchor = tableCellValueOffset(textBinding.value, resolved.anchor, row, column);
      const head = tableCellValueOffset(textBinding.value, resolved.head, row, column);
      if (input && anchor !== null && head !== null) {
        const selectionStart = Math.min(anchor, head);
        const selectionEnd = Math.max(anchor, head);
        if (
          input.selectionStart !== selectionStart
          || input.selectionEnd !== selectionEnd
          || input.selectionDirection !== direction
        ) input.setSelectionRange(selectionStart, selectionEnd, direction);
        input.focus({ preventScroll: true });
        return;
      }
    }

    if (activeEditor instanceof HTMLInputElement) {
      const row = Number(activeEditor.dataset.tableRow);
      const column = Number(activeEditor.dataset.tableColumn);
      const anchor = tableCellValueOffset(textBinding.value, resolved.anchor, row, column);
      const head = tableCellValueOffset(textBinding.value, resolved.head, row, column);
      if (Number.isInteger(row) && Number.isInteger(column) && anchor !== null && head !== null) {
        const selectionStart = Math.min(anchor, head);
        const selectionEnd = Math.max(anchor, head);
        if (
          activeEditor.selectionStart !== selectionStart
          || activeEditor.selectionEnd !== selectionEnd
          || activeEditor.selectionDirection !== direction
        ) activeEditor.setSelectionRange(selectionStart, selectionEnd, direction);
        activeEditor.focus({ preventScroll: true });
        return;
      }
    }

    const textarea = textareas.find((candidate) => {
      const offset = Number(candidate.dataset.markdownStart || 0);
      const end = Number(candidate.dataset.markdownEnd || textBinding.value.length);
      return resolved.anchor >= offset && resolved.anchor <= end && resolved.head >= offset && resolved.head <= end;
    }) ?? (activeEditor instanceof HTMLTextAreaElement ? activeEditor : null);
    if (textarea) {
      const offset = Number(textarea.dataset.markdownStart || 0);
      const end = Number(textarea.dataset.markdownEnd || textBinding.value.length);
      if (resolved.anchor < offset || resolved.anchor > end || resolved.head < offset || resolved.head > end) return;
      const selectionStart = Math.min(resolved.anchor, resolved.head) - offset;
      const selectionEnd = Math.max(resolved.anchor, resolved.head) - offset;
      if (
        textarea.selectionStart !== selectionStart
        || textarea.selectionEnd !== selectionEnd
        || textarea.selectionDirection !== direction
      ) textarea.setSelectionRange(selectionStart, selectionEnd, direction);
      textarea.focus({ preventScroll: true });
    }
  }, [documentRevision, tableSourceMode, textBinding]);

  function publishAbsoluteCursor(
    anchor: number,
    head = anchor,
    surface?: LocalCursorSurface,
  ) {
    const cursor = surface?.kind === "table-cell"
      ? createCollaborativeTableCursor(
        textBinding.viewDocument,
        "markdown",
        surface.tableStart,
        surface.row,
        surface.column,
        anchor,
        head,
      )
      : surface?.kind === "text"
        ? createCollaborativeTextCursor(textBinding.viewDocument, "markdown", anchor, head)
        : createCollaborativeCursor(textBinding.viewDocument, "markdown", anchor, head);
    publishCursorPayload(cursor);
  }

  function publishCursorPayload(cursor: CollaborativeCursor) {
    localCursorRef.current = cursor;
    setCursorIndex(cursor.index);
    setLocalCursorMarkerVisible(true);
    providerRef.current?.setAwarenessField("cursor", cursor);
  }

  function clearLocalCursor() {
    requestAnimationFrame(() => {
      const stage = editorStageRef.current;
      const active = document.activeElement;
      if (
        restoreEditorFocusRef.current
        || (stage
          && (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)
          && stage.contains(active))
      ) return;
      localCursorRef.current = null;
      setLocalCursorMarkerVisible(false);
      providerRef.current?.setAwarenessField("cursor", null);
    });
  }

  function changeMarkdown(
    next: string,
    cursorIndex: number,
    anchor = cursorIndex,
    surface?: LocalCursorSurface,
  ) {
    if (readOnly) return;
    textBinding.apply(next, "markdown-input");
    publishAbsoluteCursor(anchor, cursorIndex, surface);
  }

  function publishCursor(textarea: HTMLTextAreaElement, offset = 0) {
    const start = offset + textarea.selectionStart;
    const end = offset + textarea.selectionEnd;
    const anchor = textarea.selectionDirection === "backward" ? end : start;
    const head = textarea.selectionDirection === "backward" ? start : end;
    publishAbsoluteCursor(anchor, head, { kind: "text" });
  }

  const activeSlash = page.format === "MARKDOWN" && !readOnly ? slashMatchAt(markdown, cursorIndex) : null;
  const matchingCommands = activeSlash
    ? SLASH_COMMANDS.filter((command) => command.id.includes(activeSlash.query)
      || command.title[0].toLowerCase().includes(activeSlash.query)
      || command.title[1].toLowerCase().includes(activeSlash.query))
      .filter((command) => !publicShare || command.id !== "image")
    : [];
  const documentSegments = useMemo(
    () => page.format === "MARKDOWN" ? markdownDocumentSegments(markdown) : [],
    [markdown, page.format],
  );
  const presences = useMemo(
    () => parseCollaborativePresenceStates(awarenessStates, ydoc, "markdown"),
    [awarenessStates, documentRevision, ydoc],
  );
  const people = useMemo(() => distinctCollaborativeUsers(presences), [presences]);
  const remoteCursors = useMemo<VisibleCursor[]>(() => presences.flatMap((presence) => {
    if (presence.clientId === ydoc.clientID || !presence.cursor) return [];
      return [{
        clientId: presence.clientId,
        ...presence.user,
        hasAvatar: publicShare ? false : presence.user.hasAvatar,
        cursor: presence.cursor.head,
        surface: presence.cursor.surface,
      }];
  }), [presences, publicShare, ydoc]);
  const visualTables = documentSegments.filter(
    (segment): segment is Extract<MarkdownDocumentSegment, { type: "table" }> => segment.type === "table",
  );
  const activePeople = Math.max(people.length, 1);
  // Plain Markdown has no structural row/column identity. A concurrent delete
  // can therefore re-home unseen cell text into a neighbor. Keep destructive
  // toolbar actions disabled; users can still make an intentional source edit.
  const destructiveTableActionsAllowed = false;
  const activePeopleLabel = activePeople === 1
    ? text("1 active person", "1 aktive Person")
    : text(`${activePeople} active people`, `${activePeople} aktive Personen`);
  const activeTable = page.format === "MARKDOWN" ? editableTableAt(markdown, cursorIndex) : null;
  const showHybridTables = visualTables.length > 0 && !tableSourceMode;

  function applyEdit(edit: TextEdit) {
    if (readOnly) return;
    if (edit.changes?.length) {
      textBinding.applyChanges(edit.changes, "markdown-structural-edit");
      publishAbsoluteCursor(edit.cursor);
    } else {
      changeMarkdown(edit.text, edit.cursor);
    }
    focusMarkdownCursor(edit.cursor);
  }

  function applyInlineFormatting(style: MarkdownInlineStyle, selectionStart?: number, selectionEnd?: number) {
    if (page.format !== "MARKDOWN" || readOnly) return;
    const resolved = localCursorRef.current
      ? resolveCollaborativeCursor(localCursorRef.current, textBinding.viewDocument, "markdown")
      : null;
    const start = selectionStart ?? resolved?.anchor ?? cursorIndex;
    const end = selectionEnd ?? resolved?.head ?? cursorIndex;
    applyEdit(formatMarkdownInline(markdown, start, end, style, preferences.language));
  }

  function focusMarkdownCursor(nextCursor: number) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const restored = localCursorRef.current
        ? resolveCollaborativeCursor(localCursorRef.current, textBinding.viewDocument, "markdown")
        : null;
      const targetMarkdown = textBinding.value;
      const targetCursor = restored?.head ?? nextCursor;
      const table = editableTableAt(targetMarkdown, targetCursor);
      if (table && !tableSourceMode) {
        const cell = editorStageRef.current?.querySelector<HTMLInputElement>(
          `[data-markdown-table-start="${table.start}"] [data-table-row="${table.rowIndex}"][data-table-column="${table.columnIndex}"]`,
        );
        if (cell) {
          cell.setSelectionRange(cell.value.length, cell.value.length);
          cell.focus();
          return;
        }
      }

      const textareas = editorStageRef.current?.querySelectorAll<HTMLTextAreaElement>("textarea[data-markdown-start]");
      const textarea = Array.from(textareas || []).find((candidate) => {
        const start = Number(candidate.dataset.markdownStart || 0);
        const end = Number(candidate.dataset.markdownEnd || 0);
        return targetCursor >= start && targetCursor <= end;
      }) || textareaRef.current;
      if (!textarea) return;
      const offset = Number(textarea.dataset.markdownStart || 0);
      const localCursor = Math.max(0, Math.min(textarea.value.length, targetCursor - offset));
      textarea.setSelectionRange(localCursor, localCursor);
      textarea.focus();
      publishCursor(textarea, offset);
    }));
  }

  function executeSlashCommand(command: SlashCommandId, match = activeSlash) {
    if (!match) return;
    if (command === "image") {
      pendingImageMatchRef.current = match;
      imageInputRef.current?.click();
      return;
    }
    applyEdit(applySlashCommand(markdown, match, command, preferences.language));
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, offset = 0) {
    if (event.nativeEvent.isComposing) return;
    const localSelectionStart = event.currentTarget.selectionStart;
    const localSelectionEnd = event.currentTarget.selectionEnd;
    const selectionStart = offset + localSelectionStart;
    const selectionEnd = offset + localSelectionEnd;
    if (page.format === "MARKDOWN" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      const style = event.key.toLowerCase() === "b"
        ? "bold"
        : event.key.toLowerCase() === "i"
          ? "italic"
          : event.key.toLowerCase() === "k" ? "link" : null;
      if (style) {
        event.preventDefault();
        applyInlineFormatting(style, selectionStart, selectionEnd);
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const slash = page.format === "MARKDOWN" && !readOnly ? slashMatchAt(markdown, selectionStart) : null;
    const commands = slash
      ? SLASH_COMMANDS.filter((command) => command.id.includes(slash.query)
        || command.title[0].toLowerCase().includes(slash.query)
        || command.title[1].toLowerCase().includes(slash.query))
      : [];

    if (slash && commands.length && (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey))) {
      const exact = commands.find((command) => command.id === slash.query);
      if (exact || slash.query.length > 0) {
        event.preventDefault();
        executeSlashCommand((exact || commands[0]).id, slash);
        return;
      }
    }

    if (event.key === "Tab" && !readOnly) {
      const edit = editTextIndentation(
        event.currentTarget.value,
        localSelectionStart,
        localSelectionEnd,
        event.shiftKey,
      );
      if (!edit.changes.length) return;
      event.preventDefault();
      const emptyHybridSegment = showHybridTables && event.currentTarget.value.length === 0
        ? documentSegments.find((segment) => (
            segment.type === "text"
            && segment.start === offset
            && segment.end === offset
          ))
        : null;
      if (emptyHybridSegment?.type === "text") {
        changeHybridText(emptyHybridSegment, edit.text, offset + edit.selectionEnd);
        return;
      }
      textBinding.applyChanges(edit.changes.map((change) => ({
        ...change,
        start: offset + change.start,
        end: offset + change.end,
      })), "markdown-indentation");
      const nextStart = offset + edit.selectionStart;
      const nextEnd = offset + edit.selectionEnd;
      const backwards = event.currentTarget.selectionDirection === "backward";
      publishAbsoluteCursor(
        backwards ? nextEnd : nextStart,
        backwards ? nextStart : nextEnd,
        { kind: "text" },
      );
      return;
    }

    if (page.format !== "MARKDOWN" || event.key !== "Enter" || event.shiftKey) return;
    const edit = continueMarkdownList(markdown, selectionStart, selectionEnd);
    if (!edit) return;
    event.preventDefault();
    applyEdit(edit);
  }

  function handleTableAction(action: TableAction, table = activeTable) {
    if (!table) return;
    if ((action === "remove-row" || action === "remove-column") && !destructiveTableActionsAllowed) return;
    const tableCursor = activeTable?.start === table.start ? cursorIndex : table.start;
    const edit = editTable(markdown, tableCursor, action);
    if (edit) applyEdit(edit);
  }

  function changeHybridText(
    segment: Extract<MarkdownDocumentSegment, { type: "text" }>,
    value: string,
    cursor: number,
  ) {
    const edit = replaceHybridTextSegment(markdown, segment, value, cursor);
    changeMarkdown(
      edit.text,
      edit.cursor,
      edit.cursor,
      { kind: "text" },
    );
  }

  function changeTableCell(
    table: EditableMarkdownTable,
    row: number,
    column: number,
    value: string,
    selection: CellInputSelection,
  ) {
    const edit = updateTableCell(markdown, table.start, row, column, value);
    if (!edit) return;
    const start = tableCellCursor(edit.text, table.start, row, column, selection.selectionStart);
    const end = tableCellCursor(edit.text, table.start, row, column, selection.selectionEnd);
    if (start === null || end === null) {
      changeMarkdown(edit.text, edit.cursor);
      return;
    }
    const anchor = selection.selectionDirection === "backward" ? end : start;
    const head = selection.selectionDirection === "backward" ? start : end;
    changeMarkdown(edit.text, head, anchor, { kind: "table-cell", tableStart: table.start, row, column });
  }

  function publishTableCellCursor(
    table: EditableMarkdownTable,
    row: number,
    column: number,
    input: HTMLInputElement,
  ) {
    const start = tableCellCursor(textBinding.value, table.start, row, column, input.selectionStart ?? 0);
    const end = tableCellCursor(textBinding.value, table.start, row, column, input.selectionEnd ?? 0);
    if (start === null || end === null) return;
    const anchor = input.selectionDirection === "backward" ? end : start;
    const head = input.selectionDirection === "backward" ? start : end;
    publishAbsoluteCursor(anchor, head, { kind: "table-cell", tableStart: table.start, row, column });
  }

  async function uploadImage(
    file: File,
    match: SlashMatch | null = null,
    selection: { start: number; end: number } | null = null,
  ) {
    if (publicShare || readOnly || page.format !== "MARKDOWN" || imageBusy) return;
    setImageBusy(true);
    setEditorNotice("");
    const start = match?.start ?? selection?.start ?? cursorIndex;
    const end = match?.end ?? selection?.end ?? cursorIndex;
    const insertionCursor = createCollaborativeCursor(textBinding.viewDocument, "markdown", start, end);
    try {
      const form = new FormData();
      form.set("image", file);
      const response = await fetch(`/api/pages/${page.id}/images`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, text, {
          en: "The image could not be uploaded.",
          de: "Das Bild konnte nicht hochgeladen werden.",
        }));
      }
      const resolved = resolveCollaborativeCursor(insertionCursor, textBinding.viewDocument, "markdown");
      if (!resolved) {
        throw new Error(text("The insertion position is no longer available.", "Die Einfügeposition ist nicht mehr verfügbar."));
      }
      const insertionStart = Math.min(resolved.anchor, resolved.head);
      const insertionEnd = Math.max(resolved.anchor, resolved.head);
      const currentMarkdown = textBinding.value;
      const alt = file.name.replace(/\.[^.]+$/, "") || text("Pasted image", "Eingefügtes Bild");
      const prefix = insertionStart > 0 && currentMarkdown[insertionStart - 1] !== "\n" ? "\n" : "";
      const suffix = currentMarkdown[insertionEnd] && currentMarkdown[insertionEnd] !== "\n" ? "\n" : "";
      const markdownImage = `${prefix}![${alt.replace(/[\[\]]/g, "")}](${result.url})${suffix}`;
      textBinding.apply(
        currentMarkdown.slice(0, insertionStart) + markdownImage + currentMarkdown.slice(insertionEnd),
        "image-upload",
      );
      const nextCursor = insertionStart + markdownImage.length;
      publishAbsoluteCursor(nextCursor);
      focusMarkdownCursor(nextCursor);
      setEditorNotice(text("Image inserted.", "Bild eingefügt."));
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : text("Image could not be uploaded.", "Bild konnte nicht hochgeladen werden."));
    } finally {
      setImageBusy(false);
      pendingImageMatchRef.current = null;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>, offset = 0) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (!image || publicShare || readOnly || page.format !== "MARKDOWN") return;
    event.preventDefault();
    void uploadImage(image, null, {
      start: offset + event.currentTarget.selectionStart,
      end: offset + event.currentTarget.selectionEnd,
    });
  }

  async function persistTitle(nextTitle = title) {
    if (publicShare) return true;
    const clean = nextTitle.trim();
    if (!clean || readOnly) {
      setTitle(savedTitleRef.current);
      return false;
    }
    if (clean === savedTitleRef.current) return true;
    const response = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
    });
    if (!response.ok) {
      setTitle(savedTitleRef.current);
      return false;
    }
    savedTitleRef.current = clean;
    setTitle(clean);
    return true;
  }

  async function saveTitle() {
    await persistTitle();
  }

  async function loadVersions() {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/pages/${page.id}/versions`);
      if (!response.ok) throw new Error(text("History could not be loaded.", "Die Historie konnte nicht geladen werden."));
      setVersions(await response.json() as PageVersion[]);
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : text("History could not be loaded.", "Die Historie konnte nicht geladen werden."));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveVersion(restoredFromVersion?: number, snapshotTitle = title) {
    if (readOnly || status !== "connected") return false;
    setVersionBusy(true);
    setVersionNotice("");
    try {
      if (!await persistTitle(snapshotTitle)) throw new Error(text("The page title could not be saved.", "Der Seitentitel konnte nicht gespeichert werden."));
      const snapshot = createVisibleSnapshot(ydoc, page.format);
      const response = await fetch(`/api/pages/${page.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: snapshotTitle.trim(),
          snapshot: bytesToBase64(snapshot),
          restoredFromVersion,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, text, {
          en: "The version could not be saved.",
          de: "Die Version konnte nicht gespeichert werden.",
        }));
      }
      setVersionNotice(restoredFromVersion
        ? text(`Version ${restoredFromVersion} was restored as new version ${result.version}.`, `Version ${restoredFromVersion} wurde als neue Version ${result.version} wiederhergestellt.`)
        : text(`Version ${result.version} was saved.`, `Version ${result.version} wurde gespeichert.`));
      await loadVersions();
      return true;
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : text("The version could not be saved.", "Die Version konnte nicht gespeichert werden."));
      return false;
    } finally {
      setVersionBusy(false);
    }
  }

  async function restoreVersion(version: PageVersion) {
    if (readOnly || status !== "connected" || versionBusy) return;
    if (!window.confirm(text(
      `Restore version ${version.version}? This replaces the current page state.`,
      `Version ${version.version} wiederherstellen? Der aktuelle Seitenstand wird dabei ersetzt.`,
    ))) return;
    setVersionBusy(true);
    setVersionNotice("");
    try {
      const response = await fetch(`/api/pages/${page.id}/versions/${version.id}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, text, {
          en: "The version could not be loaded.",
          de: "Die Version konnte nicht geladen werden.",
        }));
      }
      restoreVisibleSnapshot(ydoc, base64ToBytes(result.snapshot), page.format);
      setTitle(result.title);
      setVersionBusy(false);
      await saveVersion(result.version, result.title);
      setTab(page.format === "CANVAS" ? "canvas" : page.format === "MERMAID" || page.format === "GANTT" ? "diagram" : page.format === "TODO" ? "todo" : "write");
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : text("The version could not be restored.", "Die Version konnte nicht wiederhergestellt werden."));
      setVersionBusy(false);
    }
  }

  function downloadSource() {
    if (page.format === "CANVAS") {
      const url = URL.createObjectURL(new Blob(
        [`${JSON.stringify(excalidrawFile(ydoc), null, 2)}\n`],
        { type: "application/json;charset=utf-8" },
      ));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${page.slug}.excalidraw`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    if (page.format === "TODO") {
      const url = URL.createObjectURL(new Blob([serializeTodoBoard(ydoc)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = downloadableFileName(page.title, page.format);
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const isLatex = page.format === "LATEX";
    const isPlainText = page.format === "TEXT";
    const isMermaid = page.format === "MERMAID" || page.format === "GANTT";
    const blob = new Blob([markdown], { type: `${isLatex ? "application/x-tex" : isMermaid ? "text/vnd.mermaid" : isPlainText ? "text/plain" : "text/markdown"};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadableFileName(page.title, page.format);
    link.click();
    URL.revokeObjectURL(url);
  }

  const markdownComponents = useMemo<MarkdownComponents>(() => ({
    a: ({ href, node: _node, ...props }) => {
      const external = /^(?:https?:)?\/\//i.test(href || "");
      return <a {...props} href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer noopener" : undefined} />;
    },
    ...(publicShare ? {
      img: ({ src, node: _node, ...props }) => (
        <img {...props} src={sharedPageImageUrl(src, page.id, publicShare.token)} />
      ),
    } : {}),
  }), [page.id, publicShare]);

  return (
    <div className={`editor-shell ${headerCenter ? "editor-shell-with-center" : ""} ${page.format === "CANVAS" || page.format === "MERMAID" || page.format === "GANTT" || page.format === "TODO" ? "canvas-file-editor" : ""} ${page.format === "TEXT" ? "text-file-editor" : ""}`}>
      <header className={`editor-header ${headerCenter ? "editor-header-with-center" : ""}`}>
        <div className="title-wrap">
          <input
            className="page-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            readOnly={readOnly || Boolean(publicShare)}
            aria-label={page.format === "CANVAS" ? text("Canvas title", "Canvas-Titel") : page.format === "MERMAID" ? text("Mermaid diagram title", "Mermaid-Diagrammtitel") : page.format === "GANTT" ? text("Gantt timeline title", "Gantt-Zeitstrahl-Titel") : page.format === "TODO" ? text("Todo board title", "Todo-Board-Titel") : text("Page title", "Seitentitel")}
          />
        </div>
        {headerCenter && <div className="editor-header-center">{headerCenter}</div>}
        <div className="editor-actions">
          <span className={`connection ${status}`}>
            {status === "connecting" && <LoaderCircle size={13} className="spin" />}
            {status === "connected"
              ? text("Live", "Live")
              : status === "connecting"
                ? text("Connecting …", "Verbindung …")
                : text("Offline", "Offline")}
          </span>
          <div className="presence" title={activePeopleLabel} aria-label={activePeopleLabel}>
            <Users size={16} />
            <div className="avatars">
              {people.slice(0, 4).map((person) => (
                <span style={{ background: person.color }} key={person.id}>
                  {person.hasAvatar ? <img src={`/api/users/${person.id}/avatar?v=${person.avatarVersion}`} alt="" /> : initials(person.name)}
                </span>
              ))}
            </div>
            <small>{activePeople}</small>
          </div>
          {!publicShare && <button
            className="button compact version-save-button"
            disabled={readOnly || status !== "connected" || versionBusy}
            onClick={() => void saveVersion()}
            title={readOnly ? text("Requires write access", "Nur mit Schreibzugriff verfügbar") : text("Save current state as a version", "Aktuellen Stand als Version speichern")}
          >
            {versionBusy ? <LoaderCircle size={15} className="spin" /> : <SaveIcon size={15} />}
            <span>{text("Save version", "Version speichern")}</span>
          </button>}
          {!publicShare && <button
            className="button compact secondary-button version-history-button"
            onClick={() => {
              setVersionNotice("");
              setHistoryOpen(true);
              void loadVersions();
            }}
            title={text("Open document history", "Dokumentenhistorie öffnen")}
          >
            <History size={15} /><span>{text("History", "Historie")}</span>
          </button>}
          {canManageShares && !publicShare && (
            <button className="icon-button bordered" onClick={() => setShareDialogOpen(true)} title={text("Share this page", "Diese Seite freigeben")} aria-label={text("Share this page", "Diese Seite freigeben")}><Share2 size={17} /></button>
          )}
          <button
            className="icon-button bordered"
            onClick={downloadSource}
            title={page.format === "CANVAS"
              ? text("Download Excalidraw file", "Excalidraw-Datei herunterladen")
              : page.format === "LATEX"
                ? text("Download LaTeX file", "LaTeX-Datei herunterladen")
                : page.format === "MERMAID"
                  ? text("Download Mermaid file", "Mermaid-Datei herunterladen")
                : page.format === "GANTT"
                    ? text("Download Gantt file", "Gantt-Datei herunterladen")
                    : page.format === "TODO"
                      ? text("Download Todo board", "Todo-Board herunterladen")
                    : page.format === "TEXT"
                  ? text("Download text file", "Textdatei herunterladen")
                : text("Download Markdown", "Markdown herunterladen")}
            aria-label={page.format === "CANVAS"
              ? text("Download Excalidraw file", "Excalidraw-Datei herunterladen")
              : page.format === "LATEX"
                ? text("Download LaTeX file", "LaTeX-Datei herunterladen")
                : page.format === "MERMAID"
                  ? text("Download Mermaid file", "Mermaid-Datei herunterladen")
                : page.format === "GANTT"
                    ? text("Download Gantt file", "Gantt-Datei herunterladen")
                    : page.format === "TODO"
                      ? text("Download Todo board", "Todo-Board herunterladen")
                    : page.format === "TEXT"
                  ? text("Download text file", "Textdatei herunterladen")
                : text("Download Markdown", "Markdown herunterladen")}
          >
            <Download size={17} />
          </button>
        </div>
      </header>
        {page.format !== "CANVAS" && page.format !== "MERMAID" && page.format !== "GANTT" && page.format !== "TODO" && page.format !== "TEXT" && (
        <nav className="editor-tabs">
          <button className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}><Pencil size={15} /> {page.format === "LATEX" ? text("Source", "Quelltext") : text("Write", "Schreiben")}</button>
          <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Eye size={15} /> {text("Preview", "Vorschau")}</button>
        </nav>
      )}
      <section className="editor-body">
        {page.format !== "CANVAS" && page.format !== "MERMAID" && page.format !== "GANTT" && page.format !== "TODO" && tab === "write" && (
          <div className={`markdown-editor ${page.format === "LATEX" ? "latex-source-editor" : ""}`}>
            <div className="markdown-gutter">
              <FileText size={16} /><span>{page.format === "LATEX" ? "LATEX" : page.format === "TEXT" ? text("Text", "Text") : "MARKDOWN"}</span>
              {page.format === "MARKDOWN" && <small>{publicShare
                ? text("Shared content · images are managed by Atlas members", "Geteilter Inhalt · Bilder verwalten Atlas-Mitglieder")
                : text("Type / for commands · paste images with Ctrl+V", "/ für Befehle · Bilder mit Strg+V einfügen")}</small>}
              {page.format === "MARKDOWN" && visualTables.length > 0 && (
                <HybridModeToggle
                  sourceMode={tableSourceMode}
                  text={text}
                  onToggle={() => setTableSourceMode((value) => !value)}
                />
              )}
              {page.format === "MARKDOWN" && !readOnly && (
                <div className="markdown-format-toolbar" role="toolbar" aria-label={text("Text formatting", "Textformatierung")}>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting("bold")} title={text("Bold (Ctrl+B)", "Fett (Strg+B)")} aria-label={text("Bold", "Fett")}><Bold size={14} /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting("italic")} title={text("Italic (Ctrl+I)", "Kursiv (Strg+I)")} aria-label={text("Italic", "Kursiv")}><Italic size={14} /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting("strikethrough")} title={text("Strikethrough", "Durchgestrichen")} aria-label={text("Strikethrough", "Durchgestrichen")}><Strikethrough size={14} /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting("code")} title={text("Inline code", "Inline-Code")} aria-label={text("Inline code", "Inline-Code")}><Code2 size={14} /></button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormatting("link")} title={text("Insert link (Ctrl+K)", "Link einfügen (Strg+K)")} aria-label={text("Insert link", "Link einfügen")}><Link2 size={14} /></button>
                </div>
              )}
              {imageBusy && <span className="editor-uploading"><LoaderCircle size={12} className="spin" /> {text("Uploading image…", "Bild wird hochgeladen…")}</span>}
            </div>
            <div className="textarea-stage" ref={editorStageRef}>
              {!publicShare && <input
                ref={imageInputRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadImage(file, pendingImageMatchRef.current);
                  event.target.value = "";
                }}
              />}
              {showHybridTables ? (
                <HybridMarkdownDocument
                  segments={documentSegments}
                  readOnly={readOnly}
                  activeTableStart={activeTable?.start ?? null}
                  text={text}
                  onTextChange={changeHybridText}
                  onTextKeyDown={handleEditorKeyDown}
                  onTextPaste={handlePaste}
                  onTextCursor={publishCursor}
                  onTextBlur={clearLocalCursor}
                  onCellChange={changeTableCell}
                  onCellCursor={publishTableCellCursor}
                  onCellBlur={clearLocalCursor}
                  onTableAction={(table, action) => handleTableAction(action, table)}
                  destructiveActionsDisabled={!destructiveTableActionsAllowed}
                />
              ) : (
                <textarea
                  ref={textareaRef}
                  data-markdown-start={0}
                  data-markdown-end={markdown.length}
                  value={markdown}
                  onChange={(event) => {
                    const textarea = event.currentTarget;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const anchor = textarea.selectionDirection === "backward" ? end : start;
                    const head = textarea.selectionDirection === "backward" ? start : end;
                    changeMarkdown(textarea.value, head, anchor, { kind: "text" });
                  }}
                  onKeyDown={handleEditorKeyDown}
                  onPaste={handlePaste}
                  onSelect={(event) => publishCursor(event.currentTarget)}
                  onKeyUp={(event) => publishCursor(event.currentTarget)}
                  onClick={(event) => publishCursor(event.currentTarget)}
                  onFocus={(event) => publishCursor(event.currentTarget)}
                  onBlur={clearLocalCursor}
                  onScroll={() => setScrollRevision((value) => value + 1)}
                  readOnly={readOnly}
                  spellCheck
                  aria-label={page.format === "LATEX"
                    ? text("LaTeX content", "LaTeX-Inhalt")
                    : page.format === "TEXT"
                      ? text("Text content", "Textinhalt")
                      : text("Markdown content", "Markdown-Inhalt")}
                />
              )}
              {activeSlash && matchingCommands.length > 0 && (
                <div className="slash-menu" role="listbox" aria-label={text("Markdown commands", "Markdown-Befehle")}>
                  <header><strong>{text("Insert block", "Block einfügen")}</strong><span>{text("Enter to select", "Enter zum Auswählen")}</span></header>
                  {matchingCommands.slice(0, 8).map((command) => (
                    <button key={command.id} onMouseDown={(event) => event.preventDefault()} onClick={() => executeSlashCommand(command.id)}>
                      <span>{command.id === "table" ? <Table2 size={15} /> : command.id === "image" ? <ImagePlus size={15} /> : <Code2 size={15} />}</span>
                      <div><strong>{preferences.language === "de" ? command.title[1] : command.title[0]}</strong><small>{preferences.language === "de" ? command.description[1] : command.description[0]}</small></div>
                      <kbd>/{command.id}</kbd>
                    </button>
                  ))}
                </div>
              )}
              {activeTable && !readOnly && !showHybridTables && (
                <div className="table-tools" role="toolbar" aria-label={text("Table tools", "Tabellenwerkzeuge")}>
                  <span><Table2 size={14} /> {text("Table", "Tabelle")} · {activeTable.rows.length}×{activeTable.columns}</span>
                  <button aria-label={text("Add row", "Zeile hinzufügen")} onClick={() => handleTableAction("add-row")}><Plus size={13} /> {text("Row", "Zeile")}</button>
                  <button aria-label={text("Add column", "Spalte hinzufügen")} onClick={() => handleTableAction("add-column")}><Plus size={13} /> {text("Column", "Spalte")}</button>
                  <button
                    aria-label={text("Remove row", "Zeile entfernen")}
                    disabled={!destructiveTableActionsAllowed}
                    title={!destructiveTableActionsAllowed ? text(
              "Remove rows by editing the Markdown source directly.",
              "Entfernen Sie Zeilen direkt im Markdown-Quelltext.",
                    ) : undefined}
                    onClick={() => handleTableAction("remove-row")}
                  ><Minus size={13} /> {text("Row", "Zeile")}</button>
                  <button
                    aria-label={text("Remove column", "Spalte entfernen")}
                    disabled={!destructiveTableActionsAllowed}
                    title={!destructiveTableActionsAllowed ? text(
              "Remove columns by editing the Markdown source directly.",
              "Entfernen Sie Spalten direkt im Markdown-Quelltext.",
                    ) : undefined}
                    onClick={() => handleTableAction("remove-column")}
                  ><Minus size={13} /> {text("Column", "Spalte")}</button>
                </div>
              )}
              <CurrentLineMarker
                editorStageRef={editorStageRef}
                textareaRef={textareaRef}
                markdown={markdown}
                cursorIndex={cursorIndex}
                active={localCursorMarkerVisible}
                segments={showHybridTables ? documentSegments : []}
              />
              <div className="remote-cursors" aria-hidden="true">
                {remoteCursors.map((person) => (
                  showHybridTables ? (
                    <HybridRemoteCursor
                      key={person.clientId}
                      person={person}
                      editorStageRef={editorStageRef}
                      markdown={markdown}
                      segments={documentSegments}
                      title={text(`${person.name} is writing here`, `${person.name} schreibt hier`)}
                    />
                  ) : (
                    <RemoteCursor
                      key={person.clientId}
                      person={person}
                      textareaRef={textareaRef}
                      markdown={markdown}
                      scrollRevision={scrollRevision}
                      title={text(`${person.name} is writing here`, `${person.name} schreibt hier`)}
                    />
                  )
                ))}
              </div>
            </div>
          </div>
        )}
        {page.format !== "CANVAS" && page.format !== "MERMAID" && page.format !== "GANTT" && page.format !== "TODO" && page.format !== "TEXT" && tab === "preview" && (page.format === "LATEX"
          ? <LatexPreview source={markdown} />
          : <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{markdown}</ReactMarkdown></article>)}
        {page.format === "CANVAS" && (
          <div className="canvas-visible">
            <CollaborativeCanvas ydoc={ydoc} readOnly={readOnly} />
          </div>
        )}
        {page.format === "MERMAID" && (
          <CollaborativeMermaid
            source={markdown}
            readOnly={readOnly}
            onChange={(value, cursor, anchor) => changeMarkdown(value, cursor, anchor, { kind: "text" })}
            onCursor={(textarea) => publishCursor(textarea)}
            onBlur={clearLocalCursor}
          />
        )}
        {page.format === "GANTT" && (
          <CollaborativeMermaid
            source={markdown}
            readOnly={readOnly}
            kind="gantt"
            onChange={(value, cursor, anchor) => changeMarkdown(value, cursor, anchor, { kind: "text" })}
            onCursor={(textarea) => publishCursor(textarea)}
            onBlur={clearLocalCursor}
          />
        )}
        {page.format === "TODO" && <CollaborativeTodoBoard document={ydoc} readOnly={readOnly} />}
      </section>
      {historyOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !historyLoading && !versionBusy && setHistoryOpen(false)}>
          <section className="history-dialog" role="dialog" aria-modal="true" aria-label={text("Document history", "Dokumentenhistorie")}>
            <header className="dialog-header">
              <div><span className="dialog-kicker">Atlas</span><h2>{text("Document history", "Dokumentenhistorie")}</h2></div>
              <button className="icon-button" disabled={historyLoading || versionBusy} onClick={() => setHistoryOpen(false)} aria-label={text("Close", "Schließen")}><X size={18} /></button>
            </header>
            <div className="history-intro">
              <p>{page.format === "CANVAS"
                ? text("Saved versions contain this canvas.", "Gespeicherte Versionen enthalten diesen Canvas.")
                : text("Saved versions contain this document's text.", "Gespeicherte Versionen enthalten den Text dieses Dokuments.")}</p>
              {!readOnly && <button className="button compact version-save-button" disabled={status !== "connected" || versionBusy} onClick={() => void saveVersion()}><SaveIcon size={15} /> {text("New version", "Neue Version")}</button>}
            </div>
            {versionNotice && <div className="version-notice">{versionNotice}</div>}
            <div className="version-list">
              {historyLoading && <div className="history-empty"><LoaderCircle size={18} className="spin" /> {text("Loading history…", "Historie wird geladen…")}</div>}
              {!historyLoading && !versions.length && <div className="history-empty">{text("No version has been saved yet.", "Noch keine Version gespeichert.")}</div>}
              {!historyLoading && versions.map((version, index) => (
                <article className="version-row" key={version.id}>
                  <span className="version-number">v{version.version}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <small>{formatVersionDate(version.createdAt, preferences.language)} · {version.author}</small>
                    {version.restoredFromVersion && <small>{text(`Restored from version ${version.restoredFromVersion}`, `Aus Version ${version.restoredFromVersion} wiederhergestellt`)}</small>}
                  </div>
                  {index === 0 && <span className="current-version">{text("Latest", "Neueste")}</span>}
                  {!readOnly && (
                    <button
                      className="button compact secondary-button"
                      disabled={status !== "connected" || versionBusy}
                      onClick={() => void restoreVersion(version)}
                    >
                      <RotateCcw size={14} /> {text("Restore", "Wiederherstellen")}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {versionNotice && !historyOpen && (
        <button className="atlas-toast" onClick={() => setVersionNotice("")}>{versionNotice}<X size={14} /></button>
      )}
      {editorNotice && (
        <button className="atlas-toast editor-toast" onClick={() => setEditorNotice("")}>{editorNotice}<X size={14} /></button>
      )}
      {shareDialogOpen && !publicShare && (
        <PageShareDialog pageId={page.id} pageTitle={title} pageFormat={page.format} onClose={() => setShareDialogOpen(false)} />
      )}
    </div>
  );
}

function CurrentLineMarker({
  editorStageRef,
  textareaRef,
  markdown,
  cursorIndex,
  active,
  segments,
}: {
  editorStageRef: RefObject<HTMLDivElement | null>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  markdown: string;
  cursorIndex: number;
  active: boolean;
  segments: MarkdownDocumentSegment[];
}) {
  const [position, setPosition] = useState<{ top: number; visible: boolean } | null>(null);

  useLayoutEffect(() => {
    const stage = editorStageRef.current;
    if (!stage) return;
    const update = () => {
      const cursor = Math.min(cursorIndex, markdown.length);
      const segment = segments.find((item) => item.type === "text" && cursor >= item.start && cursor <= item.end);
      const textarea = segment?.type === "text"
        ? stage.querySelector<HTMLTextAreaElement>(`textarea[data-markdown-start="${segment.start}"]`)
        : textareaRef.current;
      if (!textarea) {
        setPosition(null);
        return;
      }
      const offset = segment?.type === "text" ? segment.start : 0;
      const caret = caretPosition(textarea, Math.max(0, cursor - offset));
      const stageRect = stage.getBoundingClientRect();
      const textareaRect = textarea.getBoundingClientRect();
      const top = textareaRect.top - stageRect.top + caret.top;
      setPosition({
        top,
        visible: caret.visible && top >= 0 && top <= stage.clientHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    stage.addEventListener("scroll", update, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", update);
      stage.removeEventListener("scroll", update, { capture: true });
    };
  }, [cursorIndex, editorStageRef, markdown, segments, textareaRef]);

  if (!active || !position?.visible) return null;
  return <span className="local-cursor-line" style={{ top: position.top }} aria-hidden="true" />;
}

function HybridRemoteCursor({
  person,
  editorStageRef,
  markdown,
  segments,
  title,
}: {
  person: VisibleCursor;
  editorStageRef: RefObject<HTMLDivElement | null>;
  markdown: string;
  segments: MarkdownDocumentSegment[];
  title: string;
}) {
  const [position, setPosition] = useState<{ left: number; top: number; visible: boolean } | null>(null);

  useLayoutEffect(() => {
    const stage = editorStageRef.current;
    if (!stage || person.cursor === null) return;
    const update = () => {
      const cursor = Math.min(person.cursor || 0, markdown.length);
      const stageRect = stage.getBoundingClientRect();
      const tableSegment = segments.find((segment) => segment.type === "table" && (
        person.surface?.kind === "table-cell"
          ? segment.start === person.surface.tableStart
          : person.surface?.kind === "text"
            ? false
            : cursor > segment.start && cursor < segment.end
      ));

      if (tableSegment?.type === "table") {
        const table = editableTableAt(markdown, cursor)
          ?? editableTableAt(markdown, Math.max(tableSegment.start, Math.min(cursor - 1, tableSegment.end - 1)))
          ?? (person.surface?.kind === "table-cell"
            ? { rowIndex: person.surface.row, columnIndex: person.surface.column }
            : null);
        const cell = table && stage.querySelector<HTMLInputElement>(
          `[data-markdown-table-start="${tableSegment.start}"] `
          + `[data-table-row="${table.rowIndex}"][data-table-column="${table.columnIndex}"]`,
        );
        if (!cell) {
          setPosition(null);
          return;
        }
        const cellRect = cell.getBoundingClientRect();
        const valueOffset = tableCellValueOffset(markdown, cursor, table.rowIndex, table.columnIndex) ?? 0;
        const caret = caretPosition(cell, valueOffset);
        setPosition({
          left: cellRect.left - stageRect.left + caret.left,
          top: cellRect.top - stageRect.top + caret.top,
          visible: caret.visible
            && cellRect.bottom >= stageRect.top
            && cellRect.top <= stageRect.bottom
            && cellRect.right >= stageRect.left
            && cellRect.left <= stageRect.right,
        });
        return;
      }

      const textSegment = segments.find(
        (segment) => segment.type === "text" && cursor >= segment.start && cursor <= segment.end,
      );
      const textarea = textSegment?.type === "text"
        ? stage.querySelector<HTMLTextAreaElement>(`textarea[data-markdown-start="${textSegment.start}"]`)
        : null;
      if (!textarea || textSegment?.type !== "text") {
        setPosition(null);
        return;
      }
      const caret = caretPosition(textarea, Math.max(0, cursor - textSegment.start));
      const textareaRect = textarea.getBoundingClientRect();
      const left = textareaRect.left - stageRect.left + caret.left;
      const top = textareaRect.top - stageRect.top + caret.top;
      setPosition({
        left,
        top,
        visible: caret.visible
          && top >= 0
          && top <= stage.clientHeight
          && left >= 0
          && left <= stage.clientWidth,
      });
    };

    update();
    window.addEventListener("resize", update);
    stage.addEventListener("scroll", update, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", update);
      stage.removeEventListener("scroll", update, { capture: true });
    };
  }, [
    editorStageRef,
    markdown,
    person.cursor,
    person.surface?.kind === "table-cell" ? person.surface.column : undefined,
    person.surface?.kind === "table-cell" ? person.surface.row : undefined,
    person.surface?.kind === "table-cell" ? person.surface.tableStart : undefined,
    segments,
  ]);

  if (!position?.visible) return null;
  return (
    <span
      className="remote-cursor"
      style={{ left: position.left, top: position.top, "--cursor-color": person.color } as React.CSSProperties}
      title={title}
    >
      <span className="remote-cursor-avatar">
        {person.hasAvatar
          ? <img src={`/api/users/${person.id}/avatar?v=${person.avatarVersion}`} alt="" />
          : initials(person.name)}
      </span>
      <span className="remote-cursor-line" />
    </span>
  );
}

function RemoteCursor({
  person,
  textareaRef,
  markdown,
  scrollRevision,
  title,
}: {
  person: VisibleCursor;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  markdown: string;
  scrollRevision: number;
  title: string;
}) {
  const [position, setPosition] = useState<{ left: number; top: number; visible: boolean } | null>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || person.cursor === null) return;
    const update = () => setPosition(caretPosition(textarea, Math.min(person.cursor || 0, markdown.length)));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [markdown, person.cursor, scrollRevision, textareaRef]);

  if (!position?.visible) return null;
  return (
    <span
      className="remote-cursor"
      style={{ left: position.left, top: position.top, "--cursor-color": person.color } as React.CSSProperties}
      title={title}
    >
      <span className="remote-cursor-avatar">
        {person.hasAvatar
          ? <img src={`/api/users/${person.id}/avatar?v=${person.avatarVersion}`} alt="" />
          : initials(person.name)}
      </span>
      <span className="remote-cursor-line" />
    </span>
  );
}

function caretPosition(textarea: HTMLTextAreaElement | HTMLInputElement, index: number) {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const properties = [
    "boxSizing", "width", "height", "borderTopWidth", "borderRightWidth",
    "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight",
    "paddingBottom", "paddingLeft", "fontFamily", "fontSize", "fontWeight",
    "fontStyle", "letterSpacing", "lineHeight", "textTransform", "textIndent",
    "wordSpacing", "tabSize",
  ] as const;
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = textarea instanceof HTMLInputElement ? "pre" : "pre-wrap";
  mirror.style.overflowWrap = textarea instanceof HTMLInputElement ? "normal" : "break-word";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  for (const property of properties) {
    mirror.style[property] = style[property];
  }
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(index, index + 1) || "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const left = marker.offsetLeft - textarea.scrollLeft;
  const top = marker.offsetTop - textarea.scrollTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || 24;
  mirror.remove();
  return {
    left,
    top,
    visible: top + lineHeight >= 0 && top <= textarea.clientHeight,
  };
}

function userColor(id: string) {
  const colors = ["#cf6f45", "#4c7b72", "#7765a8", "#b1873f", "#3d75a4", "#a7586c"];
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function excalidrawFile(document: Y.Doc) {
  const settings = document.getMap<unknown>("canvas-settings");
  return {
    type: "excalidraw",
    version: 2,
    source: "https://github.com/Timo348/Atlas-Docs",
    elements: Array.from(document.getMap<unknown>("canvas-elements").values()),
    appState: {
      viewBackgroundColor: settings.get("viewBackgroundColor") || "#fbfaf7",
    },
    files: Object.fromEntries(document.getMap<unknown>("canvas-files").entries()),
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function formatVersionDate(value: string, language: "en" | "de") {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
