"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  Download, Eye, FileText, History, LoaderCircle, Network, Pencil, RotateCcw,
  Save as SaveIcon, Users, X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { CollaborativeCanvas } from "@/components/collaborative-canvas";
import { LatexPreview } from "@/components/latex-preview";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
            ydoc.transact(() => ytext.insert(0, initialContent(page)), "initial-content");
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
  }, [page.id, page.title, user.id, user.name, user.hasAvatar, user.avatarVersion, ydoc, ytext]);

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
    providerRef.current?.setAwarenessField("cursor", { index: cursorIndex });
  }

  function publishCursor(textarea: HTMLTextAreaElement) {
    providerRef.current?.setAwarenessField("cursor", { index: textarea.selectionStart });
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
      if (!response.ok) throw new Error("Die Historie konnte nicht geladen werden.");
      setVersions(await response.json() as PageVersion[]);
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : "Die Historie konnte nicht geladen werden.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveVersion(restoredFromVersion?: number, snapshotTitle = title) {
    if (readOnly || status !== "connected") return false;
    setVersionBusy(true);
    setVersionNotice("");
    try {
      if (!await persistTitle(snapshotTitle)) throw new Error("Der Seitentitel konnte nicht gespeichert werden.");
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
      if (!response.ok) throw new Error(result.error || "Die Version konnte nicht gespeichert werden.");
      setVersionNotice(restoredFromVersion
        ? `Version ${restoredFromVersion} wurde als neue Version ${result.version} wiederhergestellt.`
        : `Version ${result.version} wurde gespeichert.`);
      await loadVersions();
      return true;
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : "Die Version konnte nicht gespeichert werden.");
      return false;
    } finally {
      setVersionBusy(false);
    }
  }

  async function restoreVersion(version: PageVersion) {
    if (readOnly || status !== "connected" || versionBusy) return;
    if (!window.confirm(`Version ${version.version} wiederherstellen? Der aktuelle Seitenstand wird dabei ersetzt.`)) return;
    setVersionBusy(true);
    setVersionNotice("");
    try {
      const response = await fetch(`/api/pages/${page.id}/versions/${version.id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Die Version konnte nicht geladen werden.");
      restoreVisibleSnapshot(ydoc, base64ToBytes(result.snapshot));
      setTitle(result.title);
      setVersionBusy(false);
      await saveVersion(result.version, result.title);
      setTab("write");
    } catch (error) {
      setVersionNotice(error instanceof Error ? error.message : "Die Version konnte nicht wiederhergestellt werden.");
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
            aria-label="Seitentitel"
          />
          <span className={`connection ${status}`}>
            {status === "connecting" && <LoaderCircle size={13} className="spin" />}
            {status === "connected" ? "Live" : status === "connecting" ? "Verbinden" : "Offline"}
          </span>
        </div>
        <div className="editor-actions">
          <div className="presence" title={`${people.length} aktive Personen`}>
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
            title={readOnly ? "Nur mit Schreibzugriff verfügbar" : "Aktuellen Stand als Version speichern"}
          >
            {versionBusy ? <LoaderCircle size={15} className="spin" /> : <SaveIcon size={15} />}
            <span>Version speichern</span>
          </button>
          <button
            className="button compact secondary-button version-history-button"
            onClick={() => {
              setVersionNotice("");
              setHistoryOpen(true);
              void loadVersions();
            }}
            title="Dokumentenhistorie öffnen"
          >
            <History size={15} /><span>Historie</span>
          </button>
          <button className="icon-button bordered" onClick={downloadSource} title={page.format === "LATEX" ? "LaTeX-Datei herunterladen" : "Markdown herunterladen"}><Download size={17} /></button>
        </div>
      </header>
      <nav className="editor-tabs">
        <button className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}><Pencil size={15} /> {page.format === "LATEX" ? "Quelltext" : "Schreiben"}</button>
        <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Eye size={15} /> Vorschau</button>
        <button className={tab === "canvas" ? "active" : ""} onClick={() => setTab("canvas")}><Network size={15} /> Canvas</button>
      </nav>
      <section className="editor-body">
        {tab === "write" && (
          <div className={`markdown-editor ${page.format === "LATEX" ? "latex-source-editor" : ""}`}>
            <div className="markdown-gutter"><FileText size={16} /><span>{page.format === "LATEX" ? "LATEX" : "MARKDOWN"}</span></div>
            <div className="textarea-stage">
              <textarea
                ref={textareaRef}
                value={markdown}
                onChange={(event) => changeMarkdown(event.target.value, event.target.selectionStart)}
                onSelect={(event) => publishCursor(event.currentTarget)}
                onKeyUp={(event) => publishCursor(event.currentTarget)}
                onClick={(event) => publishCursor(event.currentTarget)}
                onFocus={(event) => publishCursor(event.currentTarget)}
                onBlur={() => providerRef.current?.setAwarenessField("cursor", null)}
                onScroll={() => setScrollRevision((value) => value + 1)}
                readOnly={readOnly}
                spellCheck
                aria-label="Markdown-Inhalt"
              />
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
          <section className="history-dialog" role="dialog" aria-modal="true" aria-label="Dokumentenhistorie">
            <header className="dialog-header">
              <div><span className="dialog-kicker">Atlas</span><h2>Dokumentenhistorie</h2></div>
              <button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="Schließen"><X size={18} /></button>
            </header>
            <div className="history-intro">
              <p>Gespeicherte Versionen enthalten den Text und den Canvas dieser Seite.</p>
              {!readOnly && <button className="button compact version-save-button" disabled={status !== "connected" || versionBusy} onClick={() => void saveVersion()}><SaveIcon size={15} /> Neue Version</button>}
            </div>
            {versionNotice && <div className="version-notice">{versionNotice}</div>}
            <div className="version-list">
              {historyLoading && <div className="history-empty"><LoaderCircle size={18} className="spin" /> Historie wird geladen …</div>}
              {!historyLoading && !versions.length && <div className="history-empty">Noch keine Version gespeichert.</div>}
              {!historyLoading && versions.map((version, index) => (
                <article className="version-row" key={version.id}>
                  <span className="version-number">v{version.version}</span>
                  <div>
                    <strong>{version.title}</strong>
                    <small>{formatVersionDate(version.createdAt)} · {version.author}</small>
                    {version.restoredFromVersion && <small>Aus Version {version.restoredFromVersion} wiederhergestellt</small>}
                  </div>
                  {index === 0 && <span className="current-version">Neueste</span>}
                  {!readOnly && (
                    <button
                      className="button compact secondary-button"
                      disabled={status !== "connected" || versionBusy}
                      onClick={() => void restoreVersion(version)}
                    >
                      <RotateCcw size={14} /> Wiederherstellen
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

function initialContent(page: PageItem) {
  if (page.format === "LATEX") {
    return `\\documentclass{article}
\\title{${escapeLatex(page.title)}}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Einleitung}
Beginne hier mit deinem LaTeX-Dokument.

\\[
  E = mc^2
\\]

\\end{document}
`;
  }
  return `# ${page.title}\n\nBeginne hier mit deiner Dokumentation …\n`;
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

function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
