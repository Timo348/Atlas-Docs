"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  AlignCenter, AlignLeft, AlignRight, Code2, Download, FilePlus2, Grid2X2, Heading1, ImagePlus,
  Link2, Lock, Maximize2, Minimize2, Move, Printer, Quote, Redo2, Share2, Table2, Trash2, Type, Undo2, Unlock, X,
} from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { PageShareDialog } from "@/components/page-share-dialog";
import { usePreferences } from "@/components/preferences-provider";
import { apiErrorMessage } from "@/lib/api-errors";
import {
  addAtlasDocElement,
  ATLASDOC_GRID_SIZE,
  ATLASDOC_PAGE_HEIGHT,
  ATLASDOC_PAGE_WIDTH,
  createAtlasDocUndoManager,
  deleteAtlasDocElement,
  deleteAtlasDocSnippet,
  initializeAtlasDoc,
  readAtlasDoc,
  serializeAtlasDoc,
  type AtlasDocElement,
  type AtlasDocElementPatch,
  type AtlasDocElementType,
  type AtlasDocSnippet,
  type AtlasDocState,
  updateAtlasDocElement,
  updateAtlasDocSettings,
  upsertAtlasDocSnippet,
} from "@/lib/atlasdoc";
import {
  applyCollaborationPermission,
  collaborationIsReadOnly,
  completeInitialCollaborationSync,
  createCollaborationAccessState,
} from "@/lib/collaboration-access";
import { downloadableFileName } from "@/lib/page-file";
import { editorHistoryAction, type EditorHistoryAction } from "@/lib/editor-history-shortcuts";
import type { PublicShareAccess } from "@/lib/public-share";

type PageItem = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  format: "MARKDOWN" | "ATLASDOC" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
};
type Connection = "connecting" | "connected" | "disconnected";
type AtlasDocCommand = { command: string; label: [string, string]; description: [string, string]; type?: AtlasDocElementType };
type SnippetDraft = Omit<AtlasDocSnippet, "id"> & { id?: string };
type FieldSelection = { field: string; elementId: string; start: number; end: number; direction: "forward" | "backward" | "none" };
const HISTORY_BEFORE_SELECTION = "atlasdoc-before-selection";
const HISTORY_AFTER_SELECTION = "atlasdoc-after-selection";

function readFieldSelection(target: EventTarget | null): FieldSelection | null {
  if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return null;
  const field = target.dataset.atlasdocField;
  const elementId = target.dataset.atlasdocElementId;
  if (!field || !elementId || target.selectionStart === null || target.selectionEnd === null) return null;
  return { field, elementId, start: target.selectionStart, end: target.selectionEnd, direction: target.selectionDirection || "none" };
}

const BUILT_IN_COMMANDS: AtlasDocCommand[] = [
  { command: "heading", label: ["Heading", "Überschrift"], description: ["Insert a movable heading", "Verschiebbare Überschrift einfügen"], type: "heading" },
  { command: "text", label: ["Text", "Text"], description: ["Insert an editable text block", "Editierbaren Textblock einfügen"], type: "text" },
  { command: "quote", label: ["Quote", "Zitat"], description: ["Insert a quote block", "Zitatblock einfügen"], type: "quote" },
  { command: "code", label: ["Code", "Code"], description: ["Insert a code block", "Codeblock einfügen"], type: "code" },
  { command: "table", label: ["Table", "Tabelle"], description: ["Insert an editable table", "Editierbare Tabelle einfügen"], type: "table" },
  { command: "image", label: ["Image", "Bild"], description: ["Insert an image frame", "Bildrahmen einfügen"], type: "image" },
  { command: "link", label: ["Link", "Link"], description: ["Insert a link element", "Linkelement einfügen"], type: "link" },
  { command: "toc", label: ["Table of contents", "Inhaltsverzeichnis"], description: ["Insert a live heading list", "Live-Überschriftenliste einfügen"], type: "toc" },
  { command: "divider", label: ["Divider", "Trennlinie"], description: ["Insert a horizontal divider", "Horizontale Trennlinie einfügen"], type: "divider" },
];

export function CollaborativeAtlasDoc({
  page,
  headerCenter,
  publicShare,
  canManageShares = false,
  fullscreen = false,
  onFullscreenChange,
}: {
  page: PageItem;
  headerCenter?: React.ReactNode;
  publicShare?: PublicShareAccess;
  canManageShares?: boolean;
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const { preferences, text } = usePreferences();
  const ydoc = useMemo(() => new Y.Doc(), [page.id]);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState<Connection>("connecting");
  const [access, setAccess] = useState(() => createCollaborationAccessState(page.id));
  const [title, setTitle] = useState(page.title);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slashValue, setSlashValue] = useState("");
  const [notice, setNotice] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [snippetDraft, setSnippetDraft] = useState<SnippetDraft | null>(null);
  const [snippetEditorOpen, setSnippetEditorOpen] = useState(false);
  const historyRef = useRef<Y.UndoManager | null>(null);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const workspaceRef = useRef<HTMLElement>(null);
  const selectionRef = useRef<FieldSelection | null>(null);
  const pendingSelectionRef = useRef<FieldSelection | null>(null);
  const languageRef = useRef(preferences.language);
  languageRef.current = preferences.language;
  const shareToken = publicShare?.token;
  const shareKind = publicShare?.kind;
  const sharePermission = publicShare?.permission;
  const state = useMemo(() => readAtlasDoc(ydoc), [ydoc, revision]);
  const readOnly = collaborationIsReadOnly(access, page.id) || publicShare?.permission === "VIEW";
  const selected = state.elements.find((element) => element.id === selectedId) || null;

  useEffect(() => {
    const manager = createAtlasDocUndoManager(ydoc);
    historyRef.current = manager;
    const update = () => setHistoryState({ canUndo: manager.canUndo(), canRedo: manager.canRedo() });
    const capture = ({ stackItem, origin }: { stackItem: { meta: Map<unknown, unknown> }; origin: unknown }) => {
      if (origin !== manager && !stackItem.meta.has(HISTORY_BEFORE_SELECTION)) {
        stackItem.meta.set(HISTORY_BEFORE_SELECTION, selectionRef.current);
      }
      update();
    };
    manager.on("stack-item-added", capture);
    manager.on("stack-item-updated", capture);
    manager.on("stack-item-popped", update);
    manager.on("stack-cleared", update);
    update();
    return () => {
      historyRef.current = null;
      manager.destroy();
    };
  }, [ydoc]);

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current;
    if (!selection) return;
    pendingSelectionRef.current = null;
    const fields = workspaceRef.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-atlasdoc-field]");
    const field = fields && Array.from(fields).find((candidate) => candidate.dataset.atlasdocField === selection.field);
    if (!field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(Math.min(selection.start, field.value.length), Math.min(selection.end, field.value.length), selection.direction);
    selectionRef.current = readFieldSelection(field);
  }, [revision, selectedId]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") {
        const selection = readFieldSelection(event.target);
        if (selection) selectionRef.current = selection;
        return;
      }
      if (!(event.target instanceof Element) || event.target.closest(".atlasdoc-slash-command")) return;
      event.preventDefault();
      applyHistory(event.inputType === "historyUndo" ? "undo" : "redo");
    };
    workspace.addEventListener("beforeinput", onBeforeInput);
    return () => workspace.removeEventListener("beforeinput", onBeforeInput);
  }, [readOnly]);

  useEffect(() => {
    const root = ydoc.getMap("atlasdoc");
    const rerender = () => setRevision((value) => value + 1);
    root.observeDeep(rerender);
    return () => root.unobserveDeep(rerender);
  }, [ydoc]);

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selected, selectedId]);

  useEffect(() => {
    let active = true;
    let mayEdit = false;
    let provider: HocuspocusProvider | undefined;
    setAccess(createCollaborationAccessState(page.id));

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
          const response = shareToken
            ? await fetch("/api/public/collaboration-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: shareToken, kind: shareKind, pageId: page.id }),
            })
            : await fetch(`/api/collaboration-token?pageId=${encodeURIComponent(page.id)}`);
          if (!response.ok) throw new Error("Collaboration token unavailable.");
          const data = await response.json() as { token: string; readOnly?: boolean };
          mayEdit = data.readOnly !== true && sharePermission !== "VIEW";
          if (active) setAccess((current) => applyCollaborationPermission(current, page.id, data.readOnly === true));
          return data.token;
        },
        onStatus: ({ status: nextStatus }) => {
          if (active) setStatus(nextStatus as Connection);
        },
        onSynced: ({ state: synced }) => {
          if (!active || !synced) return;
          if (mayEdit) initializeAtlasDoc(ydoc, languageRef.current);
          setAccess((current) => completeInitialCollaborationSync(current, page.id));
          setRevision((value) => value + 1);
        },
        onAuthenticationFailed: () => {
          if (active) setStatus("disconnected");
        },
      });
    }

    void connect().catch(() => active && setStatus("disconnected"));
    return () => {
      active = false;
      provider?.destroy();
    };
  }, [page.id, shareToken, shareKind, sharePermission, ydoc]);

  useEffect(() => () => ydoc.destroy(), [ydoc]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSnippetEditorOpen(false);
        setSnippetDraft(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const commands = useMemo(() => {
    const snippets: AtlasDocCommand[] = state.snippets.map((snippet) => ({
      command: snippet.command,
      label: [snippet.name, snippet.name],
      description: [snippet.description || "Insert a reusable snippet", snippet.description || "Wiederverwendbares Snippet einfügen"],
    }));
    return [...BUILT_IN_COMMANDS, ...snippets];
  }, [state.snippets]);
  const matchingCommands = useMemo(() => {
    const query = slashValue.trim().replace(/^\/+/, "").toLocaleLowerCase();
    if (!slashValue.trim().startsWith("/")) return [];
    return commands.filter((command) => command.command.includes(query)).slice(0, 8);
  }, [commands, slashValue]);

  function addElement(type: AtlasDocElementType) {
    if (readOnly) return;
    historyRef.current?.stopCapturing();
    const id = addAtlasDocElement(ydoc, { type }, preferences.language);
    historyRef.current?.stopCapturing();
    setSelectedId(id);
    setSlashValue("");
  }

  function insertSnippet(snippet: AtlasDocSnippet) {
    if (readOnly) return;
    historyRef.current?.stopCapturing();
    const id = addAtlasDocElement(ydoc, { type: "snippet", snippet: { ...snippet } }, preferences.language);
    historyRef.current?.stopCapturing();
    setSelectedId(id);
    setSlashValue("");
  }

  function executeSlashCommand(command: AtlasDocCommand) {
    if (command.type) {
      addElement(command.type);
      return;
    }
    const snippet = state.snippets.find((item) => item.command === command.command);
    if (snippet) insertSnippet(snippet);
  }

  function handleSlashKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSlashValue("");
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const command = matchingCommands[0];
    if (!command) {
      setNotice(text("No matching AtlasDoc command.", "Kein passender AtlasDoc-Befehl."));
      return;
    }
    executeSlashCommand(command);
  }

  function updateElement(id: string, patch: AtlasDocElementPatch) {
    if (readOnly) return;
    updateAtlasDocElement(ydoc, id, patch);
    const selection = readFieldSelection(document.activeElement) || selectionRef.current;
    selectionRef.current = selection;
    historyRef.current?.undoStack.at(-1)?.meta.set(HISTORY_AFTER_SELECTION, selection);
  }

  function editOnce(action: () => void) {
    if (readOnly) return;
    historyRef.current?.stopCapturing();
    action();
    historyRef.current?.stopCapturing();
  }

  function applyHistory(action: EditorHistoryAction) {
    const manager = historyRef.current;
    if (readOnly || !manager) return;
    const item = action === "undo" ? manager.undo() : manager.redo();
    // Yjs can discard an obsolete entry without emitting stack-item-popped.
    setHistoryState({ canUndo: manager.canUndo(), canRedo: manager.canRedo() });
    if (!item) return;
    const inverse = (action === "undo" ? manager.redoStack : manager.undoStack).at(-1);
    for (const key of [HISTORY_BEFORE_SELECTION, HISTORY_AFTER_SELECTION]) {
      if (item.meta.has(key)) inverse?.meta.set(key, item.meta.get(key));
    }
    const selection = item.meta.get(action === "undo" ? HISTORY_BEFORE_SELECTION : HISTORY_AFTER_SELECTION) as FieldSelection | null | undefined;
    if (selection) {
      pendingSelectionRef.current = selection;
      if (readAtlasDoc(ydoc).elements.some((element) => element.id === selection.elementId)) setSelectedId(selection.elementId);
    }
  }

  function rememberSelection(target: EventTarget | null) {
    const selection = readFieldSelection(target);
    if (!selection) return;
    const previous = selectionRef.current;
    if (previous && (previous.field !== selection.field || previous.start !== selection.start || previous.end !== selection.end)) historyRef.current?.stopCapturing();
    selectionRef.current = selection;
  }

  function handleHistoryKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const action = editorHistoryAction(event);
    if (!action || !(event.target instanceof Element) || event.target.closest(".atlasdoc-slash-command")) return;
    event.preventDefault();
    applyHistory(action);
  }

  function groupInteraction(active: boolean) {
    const manager = historyRef.current;
    if (!manager) return;
    manager.stopCapturing();
    manager.captureTimeout = active ? Number.POSITIVE_INFINITY : 500;
  }

  function openNewSnippet() {
    if (readOnly) return;
    setSnippetDraft({ name: "New snippet", command: "snippet", description: "", html: "<div>Custom component</div>", css: "" });
    setSnippetEditorOpen(true);
  }

  function openSnippet(snippet: AtlasDocSnippet) {
    if (readOnly) return;
    setSnippetDraft({ ...snippet });
    setSnippetEditorOpen(true);
  }

  function saveSnippet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || !snippetDraft?.name.trim() || !snippetDraft.command.trim()) return;
    historyRef.current?.stopCapturing();
    const id = upsertAtlasDocSnippet(ydoc, {
      ...snippetDraft,
      name: snippetDraft.name.trim(),
      command: snippetDraft.command.trim(),
    });
    historyRef.current?.stopCapturing();
    if (!id) return;
    setSnippetEditorOpen(false);
    setSnippetDraft(null);
    setNotice(text("Snippet saved.", "Snippet gespeichert."));
  }

  async function saveTitle() {
    if (readOnly || publicShare) return;
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === page.title) return;
    const response = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (!response.ok) setNotice(apiErrorMessage(await response.json().catch(() => null), text, { en: "The title could not be saved.", de: "Der Titel konnte nicht gespeichert werden." }));
  }

  function downloadSource() {
    const url = URL.createObjectURL(new Blob([serializeAtlasDoc(ydoc)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadableFileName(page.title, "ATLASDOC");
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={`editor-shell atlasdoc-editor-shell ${headerCenter ? "editor-shell-with-center" : ""} ${fullscreen ? "editor-shell-fullscreen" : ""}`}>
      <header className={`editor-header ${headerCenter ? "editor-header-with-center" : ""}`}>
        <div className="title-wrap">
          <input
            className="page-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            readOnly={readOnly || Boolean(publicShare)}
            aria-label={text("AtlasDoc title", "AtlasDoc-Titel")}
          />
        </div>
        {headerCenter && <div className="editor-header-center">{headerCenter}</div>}
        <div className="editor-actions">
          {onFullscreenChange && <button type="button" className="icon-button bordered" onClick={() => onFullscreenChange(!fullscreen)} title={fullscreen ? text("Exit fullscreen", "Vollbild verlassen") : text("Open fullscreen", "Vollbild öffnen")} aria-label={fullscreen ? text("Exit fullscreen", "Vollbild verlassen") : text("Open fullscreen", "Vollbild öffnen")}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
          <span className={`connection ${status}`}>{status === "connected" ? text("Live", "Live") : status === "connecting" ? text("Connecting …", "Verbindung …") : text("Offline", "Offline")}</span>
          <button type="button" className="icon-button bordered" onClick={downloadSource} title={text("Download .atlasdoc", ".atlasdoc herunterladen")} aria-label={text("Download .atlasdoc", ".atlasdoc herunterladen")}><Download size={16} /></button>
          <button type="button" className="icon-button bordered" onClick={() => window.print()} title={text("Print A4 document", "A4-Dokument drucken")} aria-label={text("Print A4 document", "A4-Dokument drucken")}><Printer size={16} /></button>
          {!publicShare && canManageShares && <button type="button" className="icon-button bordered" onClick={() => setShareOpen(true)} title={text("Share document", "Dokument teilen")} aria-label={text("Share document", "Dokument teilen")}><Share2 size={16} /></button>}
        </div>
      </header>
      <section ref={workspaceRef} className="atlasdoc-workspace" onKeyDownCapture={handleHistoryKeyDown} onSelectCapture={(event) => rememberSelection(event.target)} onFocusCapture={(event) => { historyRef.current?.stopCapturing(); rememberSelection(event.target); }}>
        <div className="atlasdoc-toolbar" role="toolbar" aria-label={text("AtlasDoc tools", "AtlasDoc-Werkzeuge")}>
          <div className="atlasdoc-tool-group">
            <button type="button" className="atlasdoc-tool-button" disabled={readOnly || !historyState.canUndo} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory("undo")} title={text("Undo (Ctrl/Cmd+Z)", "Rückgängig (Strg/Cmd+Z)")} aria-label={text("Undo", "Rückgängig")}><Undo2 size={15} /><span>{text("Undo", "Rückgängig")}</span></button>
            <button type="button" className="atlasdoc-tool-button" disabled={readOnly || !historyState.canRedo} onMouseDown={(event) => event.preventDefault()} onClick={() => applyHistory("redo")} title={text("Redo (Ctrl/Cmd+Shift+Z)", "Wiederholen (Strg/Cmd+Umschalt+Z)")} aria-label={text("Redo", "Wiederholen")}><Redo2 size={15} /><span>{text("Redo", "Wiederholen")}</span></button>
          </div>
          <div className="atlasdoc-tool-group">
            <span className="atlasdoc-toolbar-label">{text("Insert", "Einfügen")}</span>
            <AtlasDocToolButton icon={<Heading1 size={15} />} label={text("Heading", "Überschrift")} disabled={readOnly} onClick={() => addElement("heading")} />
            <AtlasDocToolButton icon={<Type size={15} />} label={text("Text", "Text")} disabled={readOnly} onClick={() => addElement("text")} />
            <AtlasDocToolButton icon={<Quote size={15} />} label={text("Quote", "Zitat")} disabled={readOnly} onClick={() => addElement("quote")} />
            <AtlasDocToolButton icon={<Code2 size={15} />} label={text("Code", "Code")} disabled={readOnly} onClick={() => addElement("code")} />
            <AtlasDocToolButton icon={<Table2 size={15} />} label={text("Table", "Tabelle")} disabled={readOnly} onClick={() => addElement("table")} />
            <AtlasDocToolButton icon={<ImagePlus size={15} />} label={text("Image", "Bild")} disabled={readOnly} onClick={() => addElement("image")} />
            <AtlasDocToolButton icon={<Link2 size={15} />} label={text("Link", "Link")} disabled={readOnly} onClick={() => addElement("link")} />
          </div>
          <div className="atlasdoc-slash-command">
            <span>/</span>
            <input value={slashValue} onChange={(event) => setSlashValue(event.target.value)} onKeyDown={handleSlashKeyDown} placeholder={text("/ command", "/ Befehl")} aria-label={text("AtlasDoc slash command", "AtlasDoc-Slash-Befehl")} disabled={readOnly} />
            {matchingCommands.length > 0 && <div className="atlasdoc-command-menu" role="listbox">{matchingCommands.map((command) => <button key={command.command} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => executeSlashCommand(command)}><strong>{preferences.language === "de" ? command.label[1] : command.label[0]}</strong><small>{preferences.language === "de" ? command.description[1] : command.description[0]}</small><code>/{command.command}</code></button>)}</div>}
          </div>
          <div className="atlasdoc-tool-group atlasdoc-layout-tools">
            <button type="button" className={`atlasdoc-toggle ${state.settings.gridVisible ? "active" : ""}`} onClick={() => editOnce(() => updateAtlasDocSettings(ydoc, { gridVisible: !state.settings.gridVisible }))} disabled={readOnly} title={text("Toggle alignment grid", "Ausrichtungsraster umschalten")}><Grid2X2 size={15} />{text("Grid", "Raster")}</button>
            <button type="button" className={`atlasdoc-toggle ${state.settings.snapToGrid ? "active" : ""}`} onClick={() => editOnce(() => updateAtlasDocSettings(ydoc, { snapToGrid: !state.settings.snapToGrid }))} disabled={readOnly}><Move size={15} />{text("Snap", "Einrasten")}</button>
            <button type="button" className="atlasdoc-toggle" onClick={openNewSnippet} disabled={readOnly}><FilePlus2 size={15} />{text("Snippet", "Snippet")}</button>
          </div>
        </div>
        <div className="atlasdoc-main">
          <div className="atlasdoc-page-scroll">
            <AtlasDocPage state={state} selectedId={selectedId} readOnly={readOnly} language={preferences.language} text={text} onSelect={setSelectedId} onUpdate={updateElement} onInteractionChange={groupInteraction} />
          </div>
          {selected && <AtlasDocInspector element={selected} state={state} readOnly={readOnly} text={text} onUpdate={(patch) => updateElement(selected.id, patch)} onDelete={() => editOnce(() => { deleteAtlasDocElement(ydoc, selected.id); setSelectedId(null); })} onClose={() => setSelectedId(null)} onToggleLock={() => editOnce(() => updateElement(selected.id, { locked: !selected.locked }))} onEditSnippet={openSnippet} onDeleteSnippet={(id) => editOnce(() => { deleteAtlasDocSnippet(ydoc, id); })} />}
        </div>
      </section>
      {notice && <button type="button" className="atlas-toast" onClick={() => setNotice("")}>{notice}<X size={14} /></button>}
      {shareOpen && <PageShareDialog pageId={page.id} pageTitle={title} allowEdit onClose={() => setShareOpen(false)} />}
      {snippetEditorOpen && snippetDraft && <AtlasDocSnippetDialog draft={snippetDraft} readOnly={readOnly} text={text} onChange={setSnippetDraft} onSave={saveSnippet} onClose={() => { setSnippetEditorOpen(false); setSnippetDraft(null); }} />}
    </div>
  );
}

function AtlasDocToolButton({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className="atlasdoc-tool-button" disabled={disabled} onClick={onClick} title={label}>{icon}<span>{label}</span></button>;
}

function AtlasDocPage({ state, selectedId, readOnly, language, text, onSelect, onUpdate, onInteractionChange }: {
  state: AtlasDocState;
  selectedId: string | null;
  readOnly: boolean;
  language: "en" | "de";
  text: (english: string, german: string) => string;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: AtlasDocElementPatch) => void;
  onInteractionChange: (active: boolean) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const finishInteraction = useRef<(() => void) | null>(null);

  useEffect(() => () => finishInteraction.current?.(), []);

  function beginInteraction(event: React.PointerEvent<HTMLElement>, element: AtlasDocElement, mode: "move" | "resize") {
    if (readOnly || element.locked || event.button !== 0) return;
    const target = event.target;
    if (mode === "move" && target instanceof Element && target.closest("[data-atlasdoc-editable], [data-atlasdoc-control]")) return;
    const page = pageRef.current;
    if (!page) return;
    event.preventDefault();
    event.stopPropagation();
    finishInteraction.current?.();
    onSelect(element.id);
    onInteractionChange(true);
    const bounds = page.getBoundingClientRect();
    const scale = ATLASDOC_PAGE_WIDTH / bounds.width;
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = { x: element.x, y: element.y, width: element.width, height: element.height };
    const snap = (value: number) => state.settings.snapToGrid ? Math.round(value / ATLASDOC_GRID_SIZE) * ATLASDOC_GRID_SIZE : value;
    const move = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) * scale;
      const deltaY = (moveEvent.clientY - startY) * scale;
      if (mode === "move") {
        onUpdate(element.id, {
          x: Math.min(ATLASDOC_PAGE_WIDTH - initial.width, Math.max(0, snap(initial.x + deltaX))),
          y: Math.min(ATLASDOC_PAGE_HEIGHT - initial.height, Math.max(0, snap(initial.y + deltaY))),
        });
      } else {
        onUpdate(element.id, {
          width: Math.min(ATLASDOC_PAGE_WIDTH - initial.x, Math.max(48, snap(initial.width + deltaX))),
          height: Math.min(ATLASDOC_PAGE_HEIGHT - initial.y, Math.max(18, snap(initial.height + deltaY))),
        });
      }
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      finishInteraction.current = null;
      onInteractionChange(false);
    };
    finishInteraction.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    window.addEventListener("blur", finish, { once: true });
  }

  return <div
    ref={pageRef}
    className={`atlasdoc-page ${state.settings.gridVisible ? "atlasdoc-page-grid" : ""}`}
    style={{ "--atlasdoc-grid-size": `${ATLASDOC_GRID_SIZE}px` } as CSSProperties}
    onPointerDown={(event) => event.target === event.currentTarget && onSelect(null)}
    aria-label={text("A4 document page", "A4-Dokumentseite")}
  >
    {state.elements.map((element) => (
      <article
        key={element.id}
        className={`atlasdoc-element atlasdoc-element-${element.type} ${selectedId === element.id ? "selected" : ""} ${element.locked ? "locked" : ""}`}
        style={{
          left: `${element.x}px`, top: `${element.y}px`, width: `${element.width}px`, height: `${element.height}px`,
          color: element.style.color, backgroundColor: element.style.backgroundColor === "transparent" ? undefined : element.style.backgroundColor,
          fontSize: `${element.style.fontSize}px`, fontWeight: element.style.fontWeight, fontFamily: element.style.fontFamily, textAlign: element.style.textAlign,
          lineHeight: element.style.lineHeight, paddingLeft: `${element.style.indent}px`,
        }}
        onPointerDown={(event) => beginInteraction(event, element, "move")}
        onClick={(event) => { event.stopPropagation(); onSelect(element.id); }}
      >
        <AtlasDocElementBody element={element} state={state} readOnly={readOnly} language={language} text={text} onUpdate={(patch) => onUpdate(element.id, patch)} />
        {selectedId === element.id && !readOnly && <span className="atlasdoc-resize-handle" data-atlasdoc-control onPointerDown={(event) => beginInteraction(event, element, "resize")} aria-hidden="true" />}
        {selectedId === element.id && <span className="atlasdoc-element-status" aria-hidden="true">{element.locked ? <Lock size={12} /> : <Move size={12} />}</span>}
      </article>
    ))}
  </div>;
}

function AtlasDocElementBody({ element, state, readOnly, language, text, onUpdate }: {
  element: AtlasDocElement;
  state: AtlasDocState;
  readOnly: boolean;
  language: "en" | "de";
  text: (english: string, german: string) => string;
  onUpdate: (patch: AtlasDocElementPatch) => void;
}) {
  const editable = !readOnly && !element.locked;
  const onTextInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => onUpdate({ text: event.currentTarget.value });
  if (element.type === "table") {
    return <table className="atlasdoc-table"><tbody>{element.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}><input data-atlasdoc-control data-atlasdoc-element-id={element.id} data-atlasdoc-field={`${element.id}:page:cell:${rowIndex}:${columnIndex}`} value={cell} disabled={!editable} aria-label={text(`Table row ${rowIndex + 1} column ${columnIndex + 1}`, `Tabelle Zeile ${rowIndex + 1} Spalte ${columnIndex + 1}`)} onChange={(event) => {
      const rows = element.rows.map((currentRow, currentRowIndex) => currentRow.map((currentCell, currentColumnIndex) => currentRowIndex === rowIndex && currentColumnIndex === columnIndex ? event.target.value : currentCell));
      onUpdate({ rows });
    }} /></td>)}</tr>)}</tbody></table>;
  }
  if (element.type === "image") {
    return element.src
      ? <img className="atlasdoc-image" src={element.src} alt={element.alt} draggable={false} />
      : <div className="atlasdoc-empty-element"><ImagePlus size={19} /><span>{text("Set an image URL in the inspector.", "Bild-URL im Inspektor eintragen.")}</span></div>;
  }
  if (element.type === "link") {
    return <div className="atlasdoc-link-element"><textarea className="atlasdoc-editable-text" data-atlasdoc-editable data-atlasdoc-element-id={element.id} data-atlasdoc-field={`${element.id}:page:text`} value={element.text} readOnly={!editable} aria-label={text("Link label", "Linktext")} onChange={onTextInput} /><a href={element.href || "#"} target="_blank" rel="noreferrer noopener" data-atlasdoc-control aria-label={text("Open link", "Link öffnen")}><Link2 size={14} /></a></div>;
  }
  if (element.type === "divider") return <hr />;
  if (element.type === "toc") {
    const headings = state.elements.filter((candidate) => candidate.type === "heading");
    return <div className="atlasdoc-toc"><strong>{text("Contents", "Inhalt")}</strong>{headings.map((heading) => <div key={heading.id}>{heading.text || text("Untitled heading", "Unbenannte Überschrift")}</div>)}{!headings.length && <small>{text("Add headings to build the list.", "Füge Überschriften hinzu, um die Liste aufzubauen.")}</small>}</div>;
  }
  if (element.type === "snippet") return <iframe className="atlasdoc-snippet-frame" title={element.snippet?.name || "AtlasDoc snippet"} sandbox="" srcDoc={snippetPreviewDocument(element.snippet)} />;
  const contentClass = element.type === "code" ? "atlasdoc-code-content" : element.type === "quote" ? "atlasdoc-quote-content" : element.type === "heading" ? "atlasdoc-heading-content" : "atlasdoc-text-content";
  return <textarea className={`${contentClass} atlasdoc-editable-text`} data-atlasdoc-editable data-atlasdoc-element-id={element.id} data-atlasdoc-field={`${element.id}:page:text`} value={element.text} readOnly={!editable} aria-label={text(`${element.type} content`, `${element.type === "heading" ? "Überschrift" : element.type === "quote" ? "Zitat" : element.type === "code" ? "Code" : "Text"} bearbeiten`)} onChange={onTextInput} />;
}

function AtlasDocInspector({ element, state, readOnly, text, onUpdate, onDelete, onClose, onToggleLock, onEditSnippet, onDeleteSnippet }: {
  element: AtlasDocElement;
  state: AtlasDocState;
  readOnly: boolean;
  text: (english: string, german: string) => string;
  onUpdate: (patch: AtlasDocElementPatch) => void;
  onDelete: () => void;
  onClose: () => void;
  onToggleLock: () => void;
  onEditSnippet: (snippet: AtlasDocSnippet) => void;
  onDeleteSnippet: (id: string) => void;
}) {
  const canEdit = !readOnly;
  const field = (name: string) => ({ "data-atlasdoc-element-id": element.id, "data-atlasdoc-field": `${element.id}:inspector:${name}` });
  return <aside className="atlasdoc-inspector" aria-label={text("Element inspector", "Elementinspektor")}>
    <header><div><span>{text("Selected element", "Ausgewähltes Element")}</span><strong>{element.type}</strong></div><button type="button" className="icon-button" onClick={onClose} aria-label={text("Close inspector", "Inspektor schließen")}><X size={15} /></button></header>
    <div className="atlasdoc-inspector-body">
      <div className="atlasdoc-inspector-grid">
        {(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key}<input type="number" value={Math.round(element[key])} min={key === "width" || key === "height" ? 18 : 0} disabled={!canEdit} onChange={(event) => onUpdate({ [key]: Number(event.target.value) })} /></label>)}
      </div>
      <button type="button" className={`atlasdoc-lock-button ${element.locked ? "active" : ""}`} disabled={!canEdit} onClick={onToggleLock}>{element.locked ? <Lock size={14} /> : <Unlock size={14} />}{element.locked ? text("Unlock element", "Element entsperren") : text("Lock element", "Element sperren")}</button>
      {(element.type === "text" || element.type === "heading" || element.type === "quote" || element.type === "code") && <label className="atlasdoc-inspector-wide"><span>{text("Content", "Inhalt")}</span><textarea {...field("text")} value={element.text} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ text: event.target.value })} /></label>}
      {element.type === "link" && <><label className="atlasdoc-inspector-wide"><span>{text("Link label", "Linktext")}</span><input {...field("text")} value={element.text} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ text: event.target.value })} /></label><label className="atlasdoc-inspector-wide"><span>URL</span><input {...field("href")} value={element.href} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ href: event.target.value })} /></label></>}
      {element.type === "image" && <><label className="atlasdoc-inspector-wide"><span>{text("Image URL", "Bild-URL")}</span><input {...field("src")} value={element.src} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ src: event.target.value })} /></label><label className="atlasdoc-inspector-wide"><span>{text("Alternative text", "Alternativtext")}</span><input {...field("alt")} value={element.alt} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ alt: event.target.value })} /></label></>}
      {element.type === "code" && <label className="atlasdoc-inspector-wide"><span>{text("Language", "Sprache")}</span><input {...field("language")} value={element.language} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ language: event.target.value })} /></label>}
      {element.type === "table" && <div className="atlasdoc-inspector-table"><span>{text("Table cells", "Tabellenzellen")}</span>{element.rows.map((row, rowIndex) => <div key={rowIndex}>{row.map((cell, columnIndex) => <input key={columnIndex} {...field(`cell:${rowIndex}:${columnIndex}`)} value={cell} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ rows: element.rows.map((currentRow, currentRowIndex) => currentRow.map((currentCell, currentColumnIndex) => currentRowIndex === rowIndex && currentColumnIndex === columnIndex ? event.target.value : currentCell)) })} />)}</div>)}</div>}
      {element.type === "snippet" && element.snippet && <div className="atlasdoc-snippet-inspector"><span>{text("Snippet source", "Snippet-Quelle")}</span><button type="button" className="button compact secondary-button" disabled={!canEdit || element.locked} onClick={() => onEditSnippet(element.snippet!)}>HTML/CSS bearbeiten</button><iframe title={element.snippet.name} sandbox="" srcDoc={snippetPreviewDocument(element.snippet)} /></div>}
      <div className="atlasdoc-style-tools"><span>{text("Text style", "Textstil")}</span><div><label>{text("Size", "Größe")}<input type="number" value={element.style.fontSize} min={8} max={96} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { fontSize: Number(event.target.value) } })} /></label><label>{text("Weight", "Stärke")}<input type="number" value={element.style.fontWeight} min={300} max={800} step={100} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { fontWeight: Number(event.target.value) } })} /></label></div><div className="atlasdoc-style-fields"><label>{text("Font", "Schrift")}<select value={element.style.fontFamily} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { fontFamily: event.target.value } })}><option value="system-ui, sans-serif">System</option><option value="Georgia, serif">Serif</option><option value="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace">Mono</option></select></label><label>{text("Line height", "Zeilenhöhe")}<input type="number" value={element.style.lineHeight} min={1} max={3} step={0.1} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { lineHeight: Number(event.target.value) } })} /></label><label>{text("Indent", "Einzug")}<input type="number" value={element.style.indent} min={0} max={96} step={4} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { indent: Number(event.target.value) } })} /></label></div><div className="atlasdoc-style-fields"><label>{text("Text color", "Textfarbe")}<input {...field("style:color")} value={element.style.color} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { color: event.target.value } })} /></label><label>{text("Background", "Hintergrund")}<input {...field("style:backgroundColor")} value={element.style.backgroundColor} disabled={!canEdit || element.locked} onChange={(event) => onUpdate({ style: { backgroundColor: event.target.value } })} /></label></div><div className="atlasdoc-align-tools"><button type="button" className={element.style.textAlign === "left" ? "active" : ""} disabled={!canEdit || element.locked} onClick={() => onUpdate({ style: { textAlign: "left" } })} aria-label={text("Align left", "Linksbündig")}><AlignLeft size={14} /></button><button type="button" className={element.style.textAlign === "center" ? "active" : ""} disabled={!canEdit || element.locked} onClick={() => onUpdate({ style: { textAlign: "center" } })} aria-label={text("Align center", "Zentriert")}><AlignCenter size={14} /></button><button type="button" className={element.style.textAlign === "right" ? "active" : ""} disabled={!canEdit || element.locked} onClick={() => onUpdate({ style: { textAlign: "right" } })} aria-label={text("Align right", "Rechtsbündig")}><AlignRight size={14} /></button></div></div>
      <div className="atlasdoc-snippet-list"><span>{text("Available snippets", "Verfügbare Snippets")}</span>{state.snippets.map((snippet) => <div key={snippet.id}><code>/{snippet.command}</code><span>{snippet.name}</span>{canEdit && <><button type="button" onClick={() => onEditSnippet(snippet)}>{text("Edit", "Bearbeiten")}</button>{!snippet.id.startsWith("callout") && !snippet.id.startsWith("approval") && <button type="button" onClick={() => onDeleteSnippet(snippet.id)}>{text("Delete", "Löschen")}</button>}</>}</div>)}</div>
    </div>
    <footer><button type="button" className="button compact danger-button" disabled={!canEdit} onClick={onDelete}><Trash2 size={14} />{text("Delete element", "Element löschen")}</button></footer>
  </aside>;
}

function AtlasDocSnippetDialog({ draft, readOnly, text, onChange, onSave, onClose }: {
  draft: SnippetDraft;
  readOnly: boolean;
  text: (english: string, german: string) => string;
  onChange: (draft: SnippetDraft) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const preview = { ...draft, id: draft.id || "preview" };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="atlasdoc-snippet-dialog" onSubmit={onSave} role="dialog" aria-modal="true" aria-label={text("Snippet editor", "Snippet-Editor")}>
    <header><div><span>AtlasDoc</span><h2>{text("Snippet editor", "Snippet-Editor")}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label={text("Close", "Schließen")}><X size={18} /></button></header>
    <div className="atlasdoc-snippet-dialog-body"><div className="atlasdoc-snippet-fields"><label>{text("Name", "Name")}<input value={draft.name} disabled={readOnly} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></label><label>{text("Slash command", "Slash-Befehl")}<input value={draft.command} disabled={readOnly} onChange={(event) => onChange({ ...draft, command: event.target.value })} /></label><label>{text("Description", "Beschreibung")}<input value={draft.description} disabled={readOnly} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></label></div><label>{text("HTML template", "HTML-Vorlage")}<textarea className="atlasdoc-code-field" value={draft.html} disabled={readOnly} onChange={(event) => onChange({ ...draft, html: event.target.value })} /></label><label>{text("CSS template", "CSS-Vorlage")}<textarea className="atlasdoc-code-field" value={draft.css} disabled={readOnly} onChange={(event) => onChange({ ...draft, css: event.target.value })} /></label><section className="atlasdoc-snippet-live-preview"><span>{text("Live preview", "Live-Vorschau")}</span><iframe title={text("Snippet live preview", "Snippet-Live-Vorschau")} sandbox="" srcDoc={snippetPreviewDocument(preview)} /></section></div>
    <footer><button type="button" className="button secondary-button" onClick={onClose}>{text("Cancel", "Abbrechen")}</button><button type="submit" className="button primary-button" disabled={readOnly || !draft.name.trim() || !draft.command.trim()}>{text("Save snippet", "Snippet speichern")}</button></footer>
  </form></div>;
}

function snippetPreviewDocument(snippet: AtlasDocSnippet | null | undefined) {
  const html = (snippet?.html || "<div>Snippet</div>").replace(/<\/script/gi, "<blocked-script");
  const css = (snippet?.css || "").replace(/<\/style/gi, "<blocked-style");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;}body{padding:8px;}${css}</style></head><body>${html}</body></html>`;
}
