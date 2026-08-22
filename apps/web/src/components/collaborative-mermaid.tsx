"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { type SyntheticEvent, useEffect, useId, useRef, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";

export function CollaborativeMermaid({
  source,
  readOnly,
  onChange,
  onCursor,
  onBlur,
  kind = "mermaid",
}: {
  source: string;
  readOnly: boolean;
  onChange: (value: string, cursor: number, anchor: number) => void;
  onCursor: (textarea: HTMLTextAreaElement) => void;
  onBlur: () => void;
  kind?: "mermaid" | "gantt";
}) {
  const { preferences, text } = usePreferences();
  const [dark, setDark] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderId = useId().replace(/:/g, "");
  const renderNumber = useRef(0);
  const isGantt = kind === "gantt";

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(preferences.colorTheme === "dark" || (preferences.colorTheme === "system" && media.matches));
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences.colorTheme]);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void render();
    }, 120);
    async function render() {
      if (!source.trim()) {
        if (active) {
          previewRef.current?.replaceChildren();
          setError("");
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          maxTextSize: 500_000,
          maxEdges: 2_000,
          theme: dark ? "dark" : "default",
          flowchart: { htmlLabels: false },
        });
        const result = await mermaid.render(`atlas-mermaid-${renderId}-${renderNumber.current++}`, source);
        if (!active || !previewRef.current) return;
        previewRef.current.innerHTML = result.svg;
        setError("");
      } catch (reason) {
        if (!active) return;
        previewRef.current?.replaceChildren();
        setError(reason instanceof Error ? reason.message : text("The diagram could not be rendered.", "Das Diagramm konnte nicht gerendert werden."));
      } finally {
        if (active) setLoading(false);
      }
    }
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [dark, renderId, source, text]);

  const publishCursor = (event: SyntheticEvent<HTMLTextAreaElement>) => onCursor(event.currentTarget);
  return (
    <div className="mermaid-editor">
      <section className="mermaid-source-pane">
        <header><strong>{isGantt ? text("Gantt timeline", "Gantt-Zeitstrahl") : "Mermaid"}</strong><small>{text("Rendered locally", "Lokal gerendert")}</small></header>
        <textarea
          value={source}
          readOnly={readOnly}
          spellCheck={false}
          aria-label={isGantt ? text("Gantt timeline source", "Gantt-Zeitstrahl-Quelltext") : text("Mermaid diagram source", "Mermaid-Diagrammquelltext")}
          onChange={(event) => {
            const textarea = event.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const anchor = textarea.selectionDirection === "backward" ? end : start;
            const cursor = textarea.selectionDirection === "backward" ? start : end;
            onChange(textarea.value, cursor, anchor);
          }}
          onSelect={publishCursor}
          onKeyUp={publishCursor}
          onClick={publishCursor}
          onFocus={publishCursor}
          onBlur={onBlur}
        />
      </section>
      <section className="mermaid-preview-pane" aria-live="polite">
        <header><strong>{text("Preview", "Vorschau")}</strong><small>{text("No external services", "Keine externen Dienste")}</small></header>
        <div className="mermaid-preview" ref={previewRef} />
        {loading && <div className="mermaid-status"><LoaderCircle size={17} className="spin" /> {text("Rendering diagram…", "Diagramm wird gerendert …")}</div>}
        {!loading && !error && !source.trim() && <div className="mermaid-status">{isGantt ? text("Start with Gantt timeline source.", "Beginne mit Gantt-Zeitstrahl-Quelltext.") : text("Start typing Mermaid source.", "Beginne mit Mermaid-Quelltext.")}</div>}
        {error && <div className="mermaid-error"><AlertCircle size={17} /><div><strong>{isGantt ? text("Invalid Gantt timeline", "Ungültiger Gantt-Zeitstrahl") : text("Invalid Mermaid source", "Ungültiger Mermaid-Quelltext")}</strong><small>{error}</small></div></div>}
      </section>
    </div>
  );
}
