"use client";

import { Download, FileWarning, LockKeyhole } from "lucide-react";
import { type ReactNode } from "react";
import { usePreferences } from "@/components/preferences-provider";

export function UnsupportedFileViewer({
  page,
  headerCenter,
  publicShare,
}: {
  page: { id: string; title: string; fileMime?: string | null; fileSize?: number | null };
  headerCenter?: ReactNode;
  publicShare?: { token: string; permission: "VIEW" | "EDIT" };
}) {
  const { text } = usePreferences();
  const downloadUrl = publicShare
    ? `/api/public/shares/${encodeURIComponent(publicShare.token)}/file`
    : `/api/pages/${encodeURIComponent(page.id)}/file`;
  return (
    <div className={`unsupported-file-shell ${headerCenter ? "unsupported-file-shell-with-center" : ""}`}>
      <header className={`editor-header ${headerCenter ? "editor-header-with-center" : ""}`}>
        <div className="title-wrap"><h1 className="unsupported-file-title">{page.title}</h1></div>
        {headerCenter && <div className="editor-header-center">{headerCenter}</div>}
        <div className="editor-actions">
          <a className="button compact secondary-button" href={downloadUrl} download>
            <Download size={16} /> {text("Download", "Herunterladen")}
          </a>
        </div>
      </header>
      <main className="unsupported-file-body">
        <span className="unsupported-file-icon"><FileWarning size={28} /></span>
        <h2>{text("Unsupported file type", "Nicht unterstützter Dateityp")}</h2>
        <p>{text(
          "Atlas keeps this file unchanged and read-only. You can download it safely at any time.",
          "Atlas speichert diese Datei unverändert und schreibgeschützt. Du kannst sie jederzeit sicher herunterladen.",
        )}</p>
        <dl>
          <div><dt>{text("Type", "Typ")}</dt><dd>{page.fileMime || text("Unknown", "Unbekannt")}</dd></div>
          <div><dt>{text("Size", "Größe")}</dt><dd>{formatFileSize(page.fileSize || 0, text)}</dd></div>
        </dl>
        <span className="unsupported-file-readonly"><LockKeyhole size={14} /> {text("Read-only", "Schreibgeschützt")}</span>
      </main>
    </div>
  );
}

function formatFileSize(bytes: number, text: (english: string, german: string) => string) {
  if (!bytes) return text("Unknown", "Unbekannt");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
