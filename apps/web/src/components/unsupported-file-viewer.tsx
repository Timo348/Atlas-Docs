"use client";

import { Download, FileWarning, LockKeyhole, Maximize2, Minimize2 } from "lucide-react";
import { type ReactNode } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { filePreviewKind } from "@/lib/file-preview";

export function UnsupportedFileViewer({
  page,
  headerCenter,
  publicShare,
  fullscreen = false,
  onFullscreenChange,
}: {
  page: { id: string; title: string; fileMime?: string | null; fileSize?: number | null };
  headerCenter?: ReactNode;
  publicShare?: { token: string; permission: "VIEW" | "EDIT" };
  fullscreen?: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}) {
  const { text } = usePreferences();
  const downloadUrl = publicShare
    ? `/api/public/shares/${encodeURIComponent(publicShare.token)}/file`
    : `/api/pages/${encodeURIComponent(page.id)}/file`;
  const previewKind = filePreviewKind(page.fileMime);
  const previewUrl = previewKind ? `${downloadUrl}?preview=1` : null;
  return (
    <div className={`unsupported-file-shell ${headerCenter ? "unsupported-file-shell-with-center" : ""} ${fullscreen ? "unsupported-file-shell-fullscreen" : ""}`}>
      <header className={`editor-header ${headerCenter ? "editor-header-with-center" : ""}`}>
        <div className="title-wrap">
          <h1 className="unsupported-file-title">{page.title}</h1>
        </div>
        {headerCenter && <div className="editor-header-center">{headerCenter}</div>}
        <div className="editor-actions">
          {onFullscreenChange && (
            <button
              type="button"
              className="icon-button bordered"
              onClick={() => onFullscreenChange(!fullscreen)}
              title={fullscreen ? text("Exit fullscreen", "Vollbild verlassen") : text("Open fullscreen", "Vollbild öffnen")}
              aria-label={fullscreen ? text("Exit fullscreen", "Vollbild verlassen") : text("Open fullscreen", "Vollbild öffnen")}
            >
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          )}
          <a className="button compact secondary-button" href={downloadUrl} download>
            <Download size={16} /> {text("Download", "Herunterladen")}
          </a>
        </div>
      </header>
      <main className={`unsupported-file-body ${previewKind ? "unsupported-file-body-with-preview" : ""} ${previewKind === "pdf" ? "unsupported-file-body-pdf" : ""}`}>
        {previewKind && previewUrl && (
          <section className={`unsupported-file-preview unsupported-file-preview-${previewKind}`} aria-label={text("File preview", "Dateivorschau")}>
            {previewKind === "pdf" && <iframe className="unsupported-file-preview-frame" src={previewUrl} title={text(`Preview of ${page.title}`, `Vorschau von ${page.title}`)} />}
            {previewKind === "image" && <img className="unsupported-file-preview-image" src={previewUrl} alt={text(`Preview of ${page.title}`, `Vorschau von ${page.title}`)} />}
            {previewKind === "audio" && <audio className="unsupported-file-preview-media" controls preload="metadata" src={previewUrl}>{text("Your browser cannot play this audio file.", "Dein Browser kann diese Audiodatei nicht abspielen.")}</audio>}
            {previewKind === "video" && <video className="unsupported-file-preview-media" controls preload="metadata" src={previewUrl}>{text("Your browser cannot play this video file.", "Dein Browser kann diese Videodatei nicht abspielen.")}</video>}
          </section>
        )}
        {previewKind !== "pdf" && (
          <section className="unsupported-file-details">
            {!previewKind && <span className="unsupported-file-icon"><FileWarning size={28} /></span>}
            <h2>{previewKind ? text("Read-only preview", "Schreibgeschützte Vorschau") : text("Unsupported file type", "Nicht unterstützter Dateityp")}</h2>
            <p>{previewKind ? text(
              "Atlas shows this browser-native preview without changing the original file. Download it to open it with another application.",
              "Atlas zeigt diese browsernative Vorschau, ohne die Originaldatei zu verändern. Lade sie herunter, um sie mit einer anderen Anwendung zu öffnen.",
            ) : text(
              "Atlas keeps this file unchanged and read-only. You can download it safely at any time.",
              "Atlas speichert diese Datei unverändert und schreibgeschützt. Du kannst sie jederzeit sicher herunterladen.",
            )}</p>
            <dl>
              <div><dt>{text("Type", "Typ")}</dt><dd>{page.fileMime || text("Unknown", "Unbekannt")}</dd></div>
              <div><dt>{text("Size", "Größe")}</dt><dd>{formatFileSize(page.fileSize || 0, text)}</dd></div>
            </dl>
            <span className="unsupported-file-readonly"><LockKeyhole size={14} /> {text("Read-only", "Schreibgeschützt")}</span>
          </section>
        )}
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
