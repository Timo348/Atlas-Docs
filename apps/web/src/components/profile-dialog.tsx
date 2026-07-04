"use client";

import { useState } from "react";
import { Camera, Settings2, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import type { Preferences } from "@/lib/preferences";

export function ProfileDialog({
  user,
  onClose,
}: {
  user: { id: string; name: string; email: string; hasAvatar: boolean; avatarVersion: number };
  onClose: () => void;
}) {
  const { preferences, setPreferences, text } = usePreferences();
  const [draft, setDraft] = useState(preferences);
  const [hasAvatar, setHasAvatar] = useState(user.hasAvatar);
  const [version, setVersion] = useState(user.avatarVersion);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("image", file);
    const response = await fetch(`/api/users/${user.id}/avatar`, { method: "PUT", body: form });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || text("Profile image could not be saved.", "Profilbild konnte nicht gespeichert werden."));
    setHasAvatar(true);
    setVersion(Date.now());
    setFile(null);
    setNotice(text("Profile image saved.", "Profilbild gespeichert."));
  }

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/users/${user.id}/avatar`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setError(text("Profile image could not be removed.", "Profilbild konnte nicht entfernt werden."));
    setHasAvatar(false);
    setNotice(text("Profile image removed.", "Profilbild entfernt."));
  }

  async function savePreferences() {
    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || text("Settings could not be saved.", "Einstellungen konnten nicht gespeichert werden."));
    setPreferences(result as Preferences);
    setNotice(draft.language === "de" ? "Einstellungen gespeichert." : "Settings saved.");
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="dialog-header">
          <div>
            <span className="dialog-kicker">{text("Your account", "Dein Konto")}</span>
            <h2 id="profile-title">{text("Profile & settings", "Profil & Einstellungen")}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={text("Close", "Schließen")}><X size={19} /></button>
        </header>

        <div className="profile-body">
          <div className="profile-avatar-large">
            {hasAvatar ? <img src={`/api/users/${user.id}/avatar?v=${version}`} alt="" /> : <span>{initials(user.name)}</span>}
          </div>
          <div>
            <h3>{user.name}</h3><p>{user.email}</p>
            <label className="file-picker"><Camera size={16} /> {text("Choose an image", "Bild auswählen")}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
            <small>{text("PNG, JPEG, WebP, or GIF. Maximum 5 MB.", "PNG, JPEG, WebP oder GIF. Maximal 5 MB.")}</small>
            <div className="profile-image-actions">
              {hasAvatar && <button className="button secondary-button compact" disabled={busy} onClick={remove}>{text("Remove", "Entfernen")}</button>}
              <button className="button secondary-button compact" disabled={!file || busy} onClick={upload}>{text("Save image", "Bild speichern")}</button>
            </div>
          </div>
        </div>

        <section className="preferences-section">
          <div className="settings-heading"><Settings2 size={17} /><div><h3>{text("Appearance & language", "Darstellung & Sprache")}</h3><p>{text("These settings follow your account across devices.", "Diese Einstellungen gelten für dein Konto auf allen Geräten.")}</p></div></div>
          <div className="preferences-grid">
            <label>{text("Language", "Sprache")}
              <select value={draft.language} onChange={(event) => update("language", event.target.value as Preferences["language"])}>
                <option value="en">English</option><option value="de">Deutsch</option>
              </select>
            </label>
            <label>{text("Color theme", "Farbtheme")}
              <select value={draft.colorTheme} onChange={(event) => update("colorTheme", event.target.value as Preferences["colorTheme"])}>
                <option value="system">{text("System", "System")}</option><option value="light">{text("Light", "Hell")}</option><option value="dark">{text("Dark", "Dunkel")}</option>
              </select>
            </label>
            <label>{text("Interface font", "Oberflächenschrift")}
              <select value={draft.uiFont} onChange={(event) => update("uiFont", event.target.value as Preferences["uiFont"])}>
                <option value="inter">Inter</option><option value="serif">Lora</option><option value="system">{text("System font", "Systemschrift")}</option>
              </select>
            </label>
            <label>{text("Editor font", "Editorschrift")}
              <select value={draft.editorFont} onChange={(event) => update("editorFont", event.target.value as Preferences["editorFont"])}>
                <option value="mono">{text("Monospace", "Monospace")}</option><option value="sans">{text("Sans serif", "Serifenlos")}</option>
              </select>
            </label>
            <label>{text("Text size", "Textgröße")}
              <select value={draft.fontSize} onChange={(event) => update("fontSize", event.target.value as Preferences["fontSize"])}>
                <option value="small">{text("Small", "Klein")}</option><option value="medium">{text("Medium", "Mittel")}</option><option value="large">{text("Large", "Groß")}</option>
              </select>
            </label>
            <label className="checkbox-setting">
              <input type="checkbox" checked={draft.compactMode} onChange={(event) => update("compactMode", event.target.checked)} />
              <span><strong>{text("Compact navigation", "Kompakte Navigation")}</strong><small>{text("Show more items in the sidebar.", "Mehr Einträge in der Seitenleiste anzeigen.")}</small></span>
            </label>
          </div>
        </section>

        {error && <p className="admin-error">{error}</p>}
        {notice && <p className="settings-notice">{notice}</p>}
        <footer className="dialog-footer">
          <span />
          <div>
            <button className="button secondary-button compact" onClick={onClose}>{text("Close", "Schließen")}</button>
            <button className="button primary-button compact" disabled={busy} onClick={savePreferences}>{busy ? text("Saving…", "Speichern…") : text("Save settings", "Einstellungen speichern")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
