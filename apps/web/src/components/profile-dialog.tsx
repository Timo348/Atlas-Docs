"use client";

import { useState } from "react";
import { Camera, X } from "lucide-react";

export function ProfileDialog({
  user,
  onClose,
}: {
  user: { id: string; name: string; email: string; hasAvatar: boolean; avatarVersion: number };
  onClose: () => void;
}) {
  const [hasAvatar, setHasAvatar] = useState(user.hasAvatar);
  const [version, setVersion] = useState(user.avatarVersion);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("image", file);
    const response = await fetch(`/api/users/${user.id}/avatar`, { method: "PUT", body: form });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Profilbild konnte nicht gespeichert werden.");
    setHasAvatar(true);
    setVersion(Date.now());
    setFile(null);
  }

  async function remove() {
    setBusy(true);
    const response = await fetch(`/api/users/${user.id}/avatar`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) return setError("Profilbild konnte nicht entfernt werden.");
    setHasAvatar(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">Dein Konto</span><h2 id="profile-title">Profilbild</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={19} /></button>
        </header>
        <div className="profile-body">
          <div className="profile-avatar-large">
            {hasAvatar ? <img src={`/api/users/${user.id}/avatar?v=${version}`} alt="" /> : <span>{initials(user.name)}</span>}
          </div>
          <div>
            <h3>{user.name}</h3><p>{user.email}</p>
            <label className="file-picker"><Camera size={16} /> JPG oder PNG auswählen<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
            <small>Maximal 5 MB. Der Dateiinhalt wird serverseitig geprüft.</small>
          </div>
        </div>
        {error && <p className="admin-error">{error}</p>}
        <footer className="dialog-footer">
          <span />
          <div>
            {hasAvatar && <button className="button secondary-button compact" disabled={busy} onClick={remove}>Entfernen</button>}
            <button className="button primary-button compact" disabled={!file || busy} onClick={upload}>{busy ? "Speichern …" : "Profilbild speichern"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
