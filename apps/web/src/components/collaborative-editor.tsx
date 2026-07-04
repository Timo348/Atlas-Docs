"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  Code2, Download, Eye, FileText, History, ImagePlus, LoaderCircle, Minus,
  Network, Pencil, Plus, RotateCcw, Save as SaveIcon, Table2, Users, X,
} from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { CollaborativeCanvas } from "@/components/collaborative-canvas";
import { LatexPreview } from "@/components/latex-preview";
import { usePreferences } from "@/components/preferences-provider";
import {
  applySlashCommand, editTable, slashMatchAt, tableAt,
  type SlashCommandId, type SlashMatch, type TableAction, type TextEdit,
} from "@/lib/markdown-editor";
import { createVisibleSnapshot, restoreVisibleSnapshot } from "@/lib/version-snapshot";

type PageItem = { id: string; title: string; slug: string; parentId: string | null; format: "MARKDOWN" | "LATEX" };
type Tab = "write" | "preview" | "canvas";
type Connection = "connecting" | "connected" | "disconnected";
type PageVersion = {
  id: string;
  version: number;
  title: string;
  author: string;
  restoredFromVersion: number | null;
  createdAt: string;
};
type Person = {
  id: string;
  name: string;
  color: string;
  hasAvatar: boolean;
  avatarVersion: number;
  cursor: number | null;
};

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

export function CollaborativeEditor({
  page,
  user,
}: {
  page: PageItem;
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "MEMBER";
    hasAvatar: boolean;
    avatarVersion: number;
  };
}) {
  const { preferences, text } = usePreferences();
  const ydoc = useMemo(() => new Y.Doc(), [page.id]);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);
  const [markdown, setMarkdown] = useState("");
  const [tab, setTab] = useState<Tab>("write");
  const [status, setStatus] = useState<Connection>("connecting");
  const [people, setPeople] = useState<Person[]>([]);
  const [scrollRevision, setScrollRevision] = useState(0);
  const [title, setTitle] = useState(page.title);
  const [readOnly, setReadOnly] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [versionNotice, setVersionNotice] = useState("");
  const [cursorIndex, setCursorIndex] = useState(0);
  const [imageBusy, setImageBusy] = useState(false);
  const [editorNotice, setEditorNotice] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImageMatchRef = useRef<SlashMatch | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const savedTitleRef = useRef(page.title);

  useEffect(() => {
    let active = true;
    let provider: HocuspocusProvider | undefined;
    const updateText = () => active && setMarkdown(ytext.toString());
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
          const response = await fetch(`/api/collaboration-token?pageId=${encodeURIComponent(page.id)}`);
          if (!response.ok) throw new Error("Collaboration token unavailable.");
          const data = await response.json();
          if (active) setReadOnly(data.readOnly);
          return data.token;
        },
        onStatus: ({ status: nextStatus }) => {
          if (active) setStatus(nextStatus as Connection);
        },
        onSynced: () => {
          if (ytext.length === 0) {
            ydoc.transact(() => ytext.insert(0, initialContent(page, preferences.language)), "initial-content");
          }
        },
        onAwarenessUpdate: ({ states }) => {
          const unique = new Map<string, Person>();
          for (const state of states) {
            const person = state.user as Partial<Person> | undefined;
            const cursor = state.cursor as { index?: number } | null | undefined;
            if (person?.id && person.name && person.color) {
              unique.set(person.id, {
                id: person.id,
                name: person.name,
                color: person.color,
                hasAvatar: person.hasAvatar === true,
                avatarVersion: typeof person.avatarVersion === "number" ? person.avatarVersion : 0,
                cursor: typeof cursor?.index === "number" ? cursor.index : null,
              });
            }
          }
          if (active) setPeople(Array.from(unique.values()));
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
    }
    void connect().catch(() => active && setStatus("disconnected"));

    return () => {
      active = false;
      ytext.unobserve(updateText);
      providerRef.current = null;
      provider?.destroy();
      ydoc.destroy();
    };
  }, [page.id, page.title, preferences.language, user.id, user.name, user.hasAvatar, user.avatarVersion, ydoc, ytext]);

  function changeMarkdown(next: string, cursorIndex: number) {
    if (readOnly) return;
    const previous = ytext.toString();
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let oldEnd = previous.length;
    let newEnd = next.length;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    ydoc.transact(() => {
      if (oldEnd > start) ytext.delete(start, oldEnd - start);
      if (newEnd > start) ytext.insert(start, next.slice(start, newEnd));
    }, "markdown-input");
    setCursorIndex(cursorIndex);
    providerRef.current?.setAwarenessField("cursor", { index: cursorIndex });
  }

  function publishCursor(textarea: HTMLTextAreaElement) {
    setCursorIndex(textarea.selectionStart);
    providerRef.current?.setAwarenessField("cursor", { index: textarea.selectionStart });
  }

  const activeSlash = page.format === "MARKDOWN" && !readOnly ? slashMatchAt(markdown, cursorIndex) : null;
  const matchingCommands = activeSlash
    ? SLASH_COMMANDS.filter((command) => command.id.includes(activeSlash.query)
      || command.title[0].toLowerCase().includes(activeSlash.query)
      || command.title[1].toLowerCase().includes(activeSlash.query))
    : [];
  const activeTable = page.format === "MARKDOWN" ? tableAt(markdown, cursorIndex) : null;

  function applyEdit(edit: TextEdit) {
    changeMarkdown(edit.text, edit.cursor);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(edit.cursor, edit.cursor);
      publishCursor(textarea);
    });
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

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!activeSlash || !matchingCommands.length || !["Enter", "Tab"].includes(event.key)) return;
    const exact = matchingCommands.find((command) => command.id === activeSlash.query);
    if (!exact && activeSlash.query.length === 0) return;
    event.preventDefault();
    executeSlashCommand((exact || matchingCommands[0]).id, activeSlash);
  }

  function handleTableAction(action: TableAction) {
    const edit = editTable(markdown, cursorIndex, action);
    if (edit) applyEdit(edit);
  }

  async function uploadImage(file: File, match: SlashMatch | null = null) {
    if (readOnly || page.format !== "MARKDOWN" || imageBusy) return;
    setImageBusy(true);
    setEditorNotice("");
    const start = match?.start ?? cursorIndex;
    const end = match?.end ?? cursorIndex;
    const relativeStart = Y.createRelativePositionFromTypeIndex(ytext, start);
    const relativeEnd = Y.createRelativePositionFromTypeIndex(ytext, end);
    try {
      const form = new FormData();
      form.set("image", file);
      const response = await fetch(`/api/pages/${page.id}/images`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || text("Image could not be uploaded.", "Bild konnte nicht hochgeladen werden."));
      const absoluteStart = Y.createAbsolutePositionFromRelativePosition(relativeStart, ydoc);
      const absoluteEnd = Y.createAbsolutePositionFromRelativePosition(relativeEnd, ydoc);
      if (!absoluteStart || !absoluteEnd || absoluteStart.type !== ytext || absoluteEnd.type !== ytext) {
        throw new Error(text("The insertion position is no longer available.", "Die Einfügeposition ist nicht mehr verfügbar."));
      }
      const alt = file.name.replace(/\.[^.]+$/, "") || text("Pasted image", "Eingefügtes Bild");
      const prefix = absoluteStart.index > 0 && ytext.toString()[absoluteStart.index - 1] !== "\n" ? "\n" : "";
      const suffix = ytext.toString()[absoluteEnd.index] && ytext.toString()[absoluteEnd.index] !== "\n" ? "\n" : "";
      const markdownImage = `${prefix}![${alt.replace(/[\[\]]/g, "")}](${result.url})${suffix}`;
      ydoc.transact(() => {
        if (absoluteEnd.index > absoluteStart.index) ytext.delete(absoluteStart.index, absoluteEnd.index - absoluteStart.index);
        ytext.insert(absoluteStart.index, markdownImage);
      }, "image-upload");
      const nextCursor = absoluteStart.index + markdownImage.length;
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(nextCursor, nextCursor);
        if (textarea) publishCursor(textarea);
      });
      setEditorNotice(text("Image inserted.", "Bild eingefügt."));
    } catch (error) {
      setEditorNotice(error instanceof Error ? error.message : text("Image could not be uploaded.", "Bild konnte nicht hochgeladen werden."));
    } finally {
      setImageBusy(false);
      pendingImageMatchRef.current = null;
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (!image || readOnly || page.format !== "MARKDOWN") return;
    event.preventDefault();
    void uploadImage(image);
  }

  async function persistTitle(nextTitle = title) {
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
      const snapshot = createVisibleSnapshot(ydoc);
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
      if (!response.ok) throw new Error(result.error || text("The version could not be saved.", "Die Version konnte nicht gespeichert werden."));
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
      if (!response.ok) throw new Error(result.error || text("The version could not be loaded.", "Die Version konnte nicht geladen werden."));
      restoreVisibleSnapshot(ydoc, base64ToBytes(result.snapshot));
      setTitle(result.title);
      setVersionBusy(false);
      await saveVersion(result.version, result.title);
      setTab("write");
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : text("The version could not be restored.", "Die Version konnte nicht wiederhergestellt werden."));
      setVersionBusy(false);
    }
  }

  function downloadSource() {
    const isLatex = page.format === "LATEX";
    const blob = new Blob([markdown], { type: `${isLatex ? "application/x-tex" : "text/markdown"};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.slug}.${isLatex ? "tex" : "md"}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="title-wrap">
          <input
            className="page-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            readOnly={readOnly}
            aria-label={text("Page title", "Seitentitel")}
          />
          <span className={`connection ${status}`}>
            {status === "connecting" && <LoaderCircle size={13} className="spin" />}
            {status === "connected" ? "Live" : status === "connecting" ? text("Connecting", "Verbinden") : "Offline"}
          </span>
        </div>
        <div className="editor-actions">
          <div className="presence" title={text(`${people.length} active people`, `${people.length} aktive Personen`)}>
            <Users size={16} />
            <div className="avatars">
              {people.slice(0, 4).map((person) => (
                <span style={{ background: person.color }} key={person.id}>
                  {person.hasAvatar ? <img src={`/api/users/${person.id}/avatar?v=${person.avatarVersion}`} alt="" /> : initials(person.name)}
                </span>
              ))}
            </div>
            <small>{people.length || 1}</small>
          </div>
          <button
            className="button compact version-save-button"
            disabled={readOnly || status !== "connected" || versionBusy}
            onClick={() => void saveVersion()}
            title={readOnly ? text("Requires write access", "Nur mit Schreibzugriff verfügbar") : text("Save current state as a version", "Aktuellen Stand als Version speichern")}
          >
            {versionBusy ? <LoaderCircle size={15} className="spin" /> : <SaveIcon size={15} />}
            <span>{text("Save version", "Version speichern")}</span>
          </button>
          <button
            className="button compact secondary-button version-history-button"
            onClick={() => {
              setVersionNotice("");
              setHistoryOpen(true);
              void loadVersions();
            }}
            title={text("Open document history", "Dokumentenhistorie öffnen")}
          >
            <History size={15} /><span>{text("History", "Historie")}</span>
          </button>
          <button className="icon-button bordered" onClick={downloadSource} title={page.format === "LATEX" ? text("Download LaTeX file", "LaTeX-Datei herunterladen") : text("Download Markdown", "Markdown herunterladen")}><Download size={17} /></button>
        </div>
      </header>
      <nav className="editor-tabs">
        <button className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}><Pencil size={15} /> {page.format === "LATEX" ? text("Source", "Quelltext") : text("Write", "Schreiben")}</button>
        <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Eye size={15} /> {text("Preview", "Vorschau")}</button>
        <button className={tab === "canvas" ? "active" : ""} onClick={() => setTab("canvas")}><Network size={15} /> Canvas</button>
      </nav>
      <section className="editor-body">
        {tab === "write" && (
          <div className={`markdown-editor ${page.format === "LATEX" ? "latex-source-editor" : ""}`}>
            <div className="markdown-gutter">
              <FileText size={16} /><span>{page.format === "LATEX" ? "LATEX" : "MARKDOWN"}</span>
              {page.format === "MARKDOWN" && <small>{text("Type / for commands · paste images with Ctrl+V", "/ für Befehle · Bilder mit Strg+V einfügen")}</small>}
              {imageBusy && <span className="editor-uploading"><LoaderCircle size={12} className="spin" /> {text("Uploading image…", "Bild wird hochgeladen…")}</span>}
            </div>
            <div className="textarea-stage">
              <input
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
              />
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(event) => changeMarkdown(event.target.value, event.target.selectionStart)}
                onKeyDown={handleEditorKeyDown}
                onPaste={handlePaste}
                onSelect={(event) => publishCursor(event.currentTarget)}
                onKeyUp={(event) => publishCursor(event.currentTarget)}
                onClick={(event) => publishCursor(event.currentTarget)}
                onFocus={(event) => publishCursor(event.currentTarget)}
                onBlur={() => providerRef.current?.setAwarenessField("cursor", null)}
                onScroll={() => setScrollRevision((value) => value + 1)}
                readOnly={readOnly}
                spellCheck
                aria-label={page.format === "LATEX" ? text("LaTeX content", "LaTeX-Inhalt") : text("Markdown content", "Markdown-Inhalt")}
              />
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
              {activeTable && !readOnly && (
                <div className="table-tools" role="toolbar" aria-label={text("Table tools", "Tabellenwerkzeuge")}>
                  <span><Table2 size={14} /> {text("Table", "Tabelle")} · {activeTable.rows}×{activeTable.columns}</span>
                  <button onClick={() => handleTableAction("add-row")}><Plus size={13} /> {text("Row", "Zeile")}</button>
                  <button onClick={() => handleTableAction("add-column")}><Plus size={13} /> {text("Column", "Spalte")}</button>
                  <button onClick={() => handleTableAction("remove-row")}><Minus size={13} /> {text("Row", "Zeile")}</button>
                  <button onClick={() => handleTableAction("remove-column")}><Minus size={13} /> {text("Column", "Spalte")}</button>
                </div>
              )}
              <div className="remote-cursors" aria-hidden="true">
                {people.filter((person) => person.id !== user.id && person.cursor !== null).map((person) => (
                  <RemoteCursor
                    key={person.id}
                    person={person}
                    textareaRef={textareaRef}
                    markdown={markdown}
                    scrollRevision={scrollRevision}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === "preview" && (page.format === "LATEX"
          ? <LatexPreview source={markdown} />
          : <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article>)}
        <div className={tab === "canvas" ? "canvas-visible" : "canvas-hidden"}>
          <CollaborativeCanvas ydoc={ydoc} readOnly={readOnly} />
        </div>
      </section>
      {historyOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHistoryOpen(false)}>
          <section className="history-dialog" role="dialog" aria-modal="true" aria-label={text("Document history", "Dokumentenhistorie")}>
            <header className="dialog-header">
              <div><span className="dialog-kicker">Atlas</span><h2>{text("Document history", "Dokumentenhistorie")}</h2></div>
              <button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label={text("Close", "Schließen")}><X size={18} /></button>
            </header>
            <div className="history-intro">
              <p>{text("Saved versions contain this page's text and canvas.", "Gespeicherte Versionen enthalten den Text und den Canvas dieser Seite.")}</p>
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
    </div>
  );
}

function RemoteCursor({
  person,
  textareaRef,
  markdown,
  scrollRevision,
}: {
  person: Person;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  markdown: string;
  scrollRevision: number;
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
      title={`${person.name} schreibt hier`}
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

function caretPosition(textarea: HTMLTextAreaElement, index: number) {
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
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
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

function initialContent(page: PageItem, language: "en" | "de") {
  const heading = language === "de" ? "Überschrift" : "Headline";
  if (page.format === "LATEX") {
    return `\\documentclass{article}
\\begin{document}
\\section{${escapeLatex(heading)}}
\\end{document}
`;
  }
  return `# ${heading}\n`;
}

function escapeLatex(value: string) {
  return value.replace(/[#$%&_{}]/g, (character) => `\\${character}`);
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
