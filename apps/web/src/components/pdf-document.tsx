"use client";

import { Download, ExternalLink, FileText, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { PageShareDialog } from "@/components/page-share-dialog";
import { usePreferences } from "@/components/preferences-provider";
import type { PublicShareAccess } from "@/lib/public-share";
import { publicShareResourceBase } from "@/lib/public-share";

type PdfPage = { id: string; title: string; slug: string };

export function PdfDocument({
  page,
  headerCenter,
  publicShare,
  canManageShares = false,
  canWrite = false,
}: {
  page: PdfPage;
  headerCenter?: ReactNode;
  publicShare?: PublicShareAccess;
  canManageShares?: boolean;
  canWrite?: boolean;
}) {
  const { text } = usePreferences();
  const [title, setTitle] = useState(page.title);
  const [savedTitle, setSavedTitle] = useState(page.title);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const source = publicShare
    ? `${publicShareResourceBase(publicShare, page.id)}/pdf`
    : `/api/pages/${page.id}/pdf`;

  async function saveTitle() {
    const clean = title.trim();
    if (publicShare || !canWrite || !clean) {
      setTitle(savedTitle);
      return;
    }
    if (clean === savedTitle) return;
    const response = await fetch(`/api/pages/${page.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: clean }),
    });
    if (!response.ok) {
      setTitle(savedTitle);
      return;
    }
    setTitle(clean);
    setSavedTitle(clean);
  }

  return (
    <div className="pdf-document-shell">
      <header className={`editor-header ${headerCenter ? "editor-header-with-center" : ""}`}>
        <div className="title-wrap">
          <input
            className="page-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
            readOnly={Boolean(publicShare) || !canWrite}
            aria-label={text("PDF title", "PDF-Titel")}
          />
        </div>
        {headerCenter && <div className="editor-header-center">{headerCenter}</div>}
        <div className="editor-actions">
          <span className="pdf-type-badge"><FileText size={14} /> PDF</span>
          {canManageShares && !publicShare && (
            <button className="icon-button bordered" onClick={() => setShareDialogOpen(true)} title={text("Share this PDF", "Dieses PDF freigeben")} aria-label={text("Share this PDF", "Dieses PDF freigeben")}><Share2 size={17} /></button>
          )}
          <a className="icon-button bordered" href={source} target="_blank" rel="noreferrer" title={text("Open PDF", "PDF öffnen")} aria-label={text("Open PDF", "PDF öffnen")}><ExternalLink size={17} /></a>
          <a className="icon-button bordered" href={`${source}?download=1`} title={text("Download PDF", "PDF herunterladen")} aria-label={text("Download PDF", "PDF herunterladen")}><Download size={17} /></a>
        </div>
      </header>
      <section className="pdf-viewer-panel">
        <iframe src={source} title={title} />
        <p>{text(
          "If your browser cannot display the PDF, open or download it using the buttons above.",
          "Falls dein Browser das PDF nicht anzeigen kann, öffne oder lade es über die Schaltflächen oben herunter.",
        )}</p>
      </section>
      {shareDialogOpen && <PageShareDialog pageId={page.id} pageTitle={title} allowEdit={false} onClose={() => setShareDialogOpen(false)} />}
    </div>
  );
}
