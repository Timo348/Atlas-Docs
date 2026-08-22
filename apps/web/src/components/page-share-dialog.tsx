"use client";

import { Check, Clipboard, ExternalLink, Link2, LoaderCircle, Shield, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api-errors";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { usePreferences } from "@/components/preferences-provider";

type PageShareRow = {
  id: string;
  label: string;
  tokenPrefix: string;
  permission: "VIEW" | "EDIT";
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
  createdBy: { name: string | null; email: string };
};

export function PageShareDialog({ pageId, pageTitle, pageFormat, onClose }: {
  pageId: string;
  pageTitle: string;
  pageFormat: "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
  onClose: () => void;
}) {
  const { preferences, text } = usePreferences();
  const [shares, setShares] = useState<PageShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState(pageTitle.slice(0, 80));
  const [permission, setPermission] = useState<"VIEW" | "EDIT">("VIEW");
  const [expiry, setExpiry] = useState("30");
  const [createdUrl, setCreatedUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const fileReadOnly = pageFormat === "FILE";
  useDialogEscape(onClose, busy, true);

  useEffect(() => {
    let active = true;
    void fetch(`/api/pages/${pageId}/shares`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(result, text, {
          en: "Page links could not be loaded.", de: "Seitenlinks konnten nicht geladen werden.",
        }));
        if (active) setShares(result as PageShareRow[]);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : text("Page links could not be loaded.", "Seitenlinks konnten nicht geladen werden.")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [pageId, text]);

  async function createShare() {
    setBusy(true);
    setError("");
    setCreatedUrl("");
    try {
      const expiresAt = expiry === "never"
        ? null
        : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(`/api/pages/${pageId}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, permission, expiresAt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(result, text, {
        en: "The page link could not be created.", de: "Der Seitenlink konnte nicht erstellt werden.",
      }));
      const { url, ...row } = result as PageShareRow & { url: string };
      setShares((current) => [row, ...current]);
      setCreatedUrl(url);
      setCopied(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("The page link could not be created.", "Der Seitenlink konnte nicht erstellt werden."));
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedUrl() {
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
    } catch {
      setError(text("Copying failed. Select the link and copy it manually.", "Kopieren fehlgeschlagen. Markiere den Link und kopiere ihn manuell."));
    }
  }

  async function updatePermission(share: PageShareRow, nextPermission: "VIEW" | "EDIT") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/pages/${pageId}/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: nextPermission }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(result, text, {
        en: "The permission could not be changed.", de: "Die Berechtigung konnte nicht geändert werden.",
      }));
      setShares((current) => current.map((item) => item.id === share.id ? result as PageShareRow : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("The permission could not be changed.", "Die Berechtigung konnte nicht geändert werden."));
    } finally {
      setBusy(false);
    }
  }

  async function revokeShare(share: PageShareRow) {
    if (!window.confirm(text(`Revoke “${share.label}”? The link will stop working.`, `„${share.label}“ widerrufen? Der Link funktioniert danach nicht mehr.`))) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/pages/${pageId}/shares/${share.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(apiErrorMessage(result, text, {
          en: "The page link could not be revoked.", de: "Der Seitenlink konnte nicht widerrufen werden.",
        }));
      }
      setShares((current) => current.map((item) => item.id === share.id
        ? { ...item, active: false, revokedAt: new Date().toISOString() }
        : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("The page link could not be revoked.", "Der Seitenlink konnte nicht widerrufen werden."));
    } finally {
      setBusy(false);
    }
  }

  const activeShares = shares.filter((share) => share.active);
  const inactiveShares = shares.filter((share) => !share.active);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="page-share-dialog" role="dialog" aria-modal="true" aria-label={text("Share page", "Seite freigeben")}>
        <header className="dialog-header">
          <div><span className="dialog-kicker">Atlas</span><h2>{text("Share this page", "Diese Seite freigeben")}</h2></div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label={text("Close", "Schließen")}><X size={18} /></button>
        </header>
        <div className="page-share-intro">
          <Shield size={18} />
          <p>{text(
            "Anyone holding a link gets access to this page only. Links are stored as hashes and can be changed or revoked here.",
            "Jeder mit dem Link erhält nur Zugriff auf diese Seite. Links werden gehasht gespeichert und können hier geändert oder widerrufen werden.",
          )}</p>
        </div>
        <div className="page-share-body">
          {error && <div className="form-error">{error}</div>}
          <section className="page-share-create">
            <div className="page-share-section-title"><div><span>01</span><strong>{text("Create a new link", "Neuen Link erstellen")}</strong></div><small>{text("The full link is shown once.", "Der vollständige Link wird einmal angezeigt.")}</small></div>
            <div className="page-share-create-grid">
              <label><span>{text("Label", "Bezeichnung")}</span><input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} /></label>
              <label><span>{text("Access", "Zugriff")}</span><select value={permission} disabled={fileReadOnly} onChange={(event) => setPermission(event.target.value as "VIEW" | "EDIT")}><option value="VIEW">{text("View only", "Nur lesen")}</option>{!fileReadOnly && <option value="EDIT">{text("Edit content", "Inhalt bearbeiten")}</option>}</select></label>
              <label><span>{text("Expires", "Läuft ab")}</span><select value={expiry} onChange={(event) => setExpiry(event.target.value)}><option value="7">{text("In 7 days", "In 7 Tagen")}</option><option value="30">{text("In 30 days", "In 30 Tagen")}</option><option value="90">{text("In 90 days", "In 90 Tagen")}</option><option value="never">{text("Never", "Nie")}</option></select></label>
              <button className="button primary-button" disabled={busy || !label.trim()} onClick={() => void createShare()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Link2 size={15} />}{text("Create link", "Link erstellen")}</button>
            </div>
            {permission === "EDIT" && <p className="page-share-warning">{text("Edit links can change document or canvas content, but not the page title, history, images, or space settings.", "Bearbeitungslinks können Dokument- oder Canvas-Inhalte ändern, aber nicht Seitentitel, Historie, Bilder oder Bereichseinstellungen.")}</p>}
            {createdUrl && (
              <div className="page-share-created">
                <div><strong>{text("Copy this link now", "Diesen Link jetzt kopieren")}</strong><small>{text("For security, Atlas cannot display it again after this dialog is closed.", "Aus Sicherheitsgründen kann Atlas ihn nach dem Schließen nicht erneut anzeigen.")}</small></div>
                <input readOnly value={createdUrl} onFocus={(event) => event.currentTarget.select()} aria-label={text("Created page link", "Erstellter Seitenlink")} />
                <button className="button compact secondary-button" onClick={() => void copyCreatedUrl()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? text("Copied", "Kopiert") : text("Copy", "Kopieren")}</button>
                <a className="icon-button bordered" href={createdUrl} target="_blank" rel="noreferrer" aria-label={text("Open link", "Link öffnen")}><ExternalLink size={15} /></a>
              </div>
            )}
          </section>
          <section className="page-share-list-section">
            <div className="page-share-section-title"><div><span>02</span><strong>{text("Active links", "Aktive Links")}</strong></div><small>{activeShares.length}</small></div>
            {loading && <div className="page-share-empty"><LoaderCircle size={16} className="spin" /> {text("Loading links…", "Links werden geladen…")}</div>}
            {!loading && !activeShares.length && <div className="page-share-empty">{text("No active page link yet.", "Noch kein aktiver Seitenlink.")}</div>}
            <div className="page-share-list">
              {activeShares.map((share) => (
                <article className="page-share-row" key={share.id}>
                  <span className="page-share-link-icon"><Link2 size={15} /></span>
                  <div><strong>{share.label}</strong><small>#{share.tokenPrefix} · {text("created", "erstellt")} {formatDate(share.createdAt, preferences.language)} · {share.expiresAt ? text(`expires ${formatDate(share.expiresAt, preferences.language)}`, `bis ${formatDate(share.expiresAt, preferences.language)}`) : text("no expiry", "ohne Ablaufdatum")}</small></div>
                  <select disabled={busy || fileReadOnly} value={share.permission} aria-label={text(`Access for ${share.label}`, `Zugriff für ${share.label}`)} onChange={(event) => void updatePermission(share, event.target.value as "VIEW" | "EDIT")}><option value="VIEW">{text("View", "Lesen")}</option>{!fileReadOnly && <option value="EDIT">{text("Edit", "Bearbeiten")}</option>}</select>
                  <button className="icon-button danger-icon" disabled={busy} onClick={() => void revokeShare(share)} title={text("Revoke link", "Link widerrufen")} aria-label={text(`Revoke ${share.label}`, `${share.label} widerrufen`)}><Trash2 size={15} /></button>
                </article>
              ))}
            </div>
            {inactiveShares.length > 0 && <details className="page-share-inactive"><summary>{text(`${inactiveShares.length} expired or revoked`, `${inactiveShares.length} abgelaufen oder widerrufen`)}</summary>{inactiveShares.map((share) => <div key={share.id}><span>{share.label}</span><small>#{share.tokenPrefix}</small></div>)}</details>}
          </section>
        </div>
        <footer className="dialog-footer"><small>{text("A shared link is a credential. Send it through a trusted channel; changes revalidate open sessions within one minute.", "Ein Freigabelink ist ein Zugangsschlüssel. Versende ihn vertrauenswürdig; Änderungen werden in offenen Sitzungen innerhalb einer Minute geprüft.")}</small><button className="button secondary-button" disabled={busy} onClick={onClose}>{text("Done", "Fertig")}</button></footer>
      </section>
    </div>
  );
}

function formatDate(value: string, language: "en" | "de") {
  return new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}
