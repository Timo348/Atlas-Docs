"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

export function LatexPreview({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setRendering(true);
        const { parse, HtmlGenerator } = await import("latex.js");
        const generator = new HtmlGenerator({ hyphenate: false, documentClass: "article" });
        const document = parse(source, { generator });
        if (!active || !containerRef.current) return;
        const shadow = containerRef.current.shadowRoot || containerRef.current.attachShadow({ mode: "open" });
        const page = window.document.createElement("div");
        page.className = "page";
        page.appendChild(document.domFragment());
        const styles = ["base.css", "article.css", "katex.css"].map((name) => {
          const link = window.document.createElement("link");
          link.rel = "stylesheet";
          link.href = `/latex-assets/css/${name}`;
          return link;
        });
        shadow.replaceChildren(...styles, page);
        document.applyLengthsAndGeometryToDom(containerRef.current);
        setError("");
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Das LaTeX-Dokument konnte nicht gerendert werden.");
      } finally {
        if (active) setRendering(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [source]);

  return (
    <div className="latex-preview-shell">
      {rendering && <span className="latex-rendering"><LoaderCircle className="spin" size={14} /> LaTeX wird gesetzt …</span>}
      {error && <div className="latex-error"><AlertTriangle size={17} /><div><strong>LaTeX-Fehler</strong><span>{error}</span></div></div>}
      <article ref={containerRef} className="latex-preview" />
    </div>
  );
}
