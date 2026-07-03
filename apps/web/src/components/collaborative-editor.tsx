"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { Download, Eye, FileText, LoaderCircle, Network, Pencil, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Y from "yjs";
import { CollaborativeCanvas } from "@/components/collaborative-canvas";

type PageItem = { id: string; title: string; slug: string; parentId: string | null };
type Tab = "write" | "preview" | "canvas";
type Connection = "connecting" | "connected" | "disconnected";

export function CollaborativeEditor({
  page,
  user,
}: {
  page: PageItem;
  user: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };
}) {
  const ydoc = useMemo(() => new Y.Doc(), [page.id]);
  const ytext = useMemo(() => ydoc.getText("markdown"), [ydoc]);
  const [markdown, setMarkdown] = useState("");
  const [tab, setTab] = useState<Tab>("write");
  const [status, setStatus] = useState<Connection>("connecting");
  const [people, setPeople] = useState<{ id: string; name: string; color: string }[]>([]);
  const [title, setTitle] = useState(page.title);
  const [readOnly, setReadOnly] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
            ydoc.transact(() => ytext.insert(0, `# ${page.title}\n\nBeginne hier mit deiner Dokumentation …\n`), "initial-content");
          }
        },
        onAwarenessUpdate: ({ states }) => {
          const unique = new Map<string, { id: string; name: string; color: string }>();
          for (const state of states) {
            const person = state.user as { id?: string; name?: string; color?: string } | undefined;
            if (person?.id && person.name && person.color) unique.set(person.id, person as { id: string; name: string; color: string });
          }
          if (active) setPeople(Array.from(unique.values()));
        },
        onAuthenticationFailed: () => {
          if (active) setStatus("disconnected");
        },
      });
      provider.setAwarenessField("user", { id: user.id, name: user.name, color });
    }
    void connect().catch(() => active && setStatus("disconnected"));

    return () => {
      active = false;
      ytext.unobserve(updateText);
      provider?.destroy();
      ydoc.destroy();
    };
  }, [page.id, page.title, user.id, user.name, ydoc, ytext]);

  function changeMarkdown(next: string) {
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
  }

  async function saveTitle() {
    const clean = title.trim();
    if (!clean || clean === page.title || readOnly) return setTitle(page.title);
    const response = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
    });
    if (!response.ok) setTitle(page.title);
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${page.slug}.md`;
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
              {people.slice(0, 4).map((person) => <span style={{ background: person.color }} key={person.id}>{initials(person.name)}</span>)}
            </div>
            <small>{people.length || 1}</small>
          </div>
          <button className="icon-button bordered" onClick={downloadMarkdown} title="Markdown herunterladen"><Download size={17} /></button>
        </div>
      </header>
      <nav className="editor-tabs">
        <button className={tab === "write" ? "active" : ""} onClick={() => setTab("write")}><Pencil size={15} /> Schreiben</button>
        <button className={tab === "preview" ? "active" : ""} onClick={() => setTab("preview")}><Eye size={15} /> Vorschau</button>
        <button className={tab === "canvas" ? "active" : ""} onClick={() => setTab("canvas")}><Network size={15} /> Canvas</button>
      </nav>
      <section className="editor-body">
        {tab === "write" && (
          <div className="markdown-editor">
            <div className="markdown-gutter"><FileText size={16} /><span>MARKDOWN</span></div>
            <textarea
              ref={textareaRef}
              value={markdown}
              onChange={(event) => changeMarkdown(event.target.value)}
              readOnly={readOnly}
              spellCheck
              aria-label="Markdown-Inhalt"
            />
          </div>
        )}
        {tab === "preview" && <article className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></article>}
        <div className={tab === "canvas" ? "canvas-visible" : "canvas-hidden"}>
          <CollaborativeCanvas ydoc={ydoc} readOnly={readOnly} />
        </div>
      </section>
    </div>
  );
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
