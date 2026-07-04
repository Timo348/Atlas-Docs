"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ImagePlus, Users, X } from "lucide-react";

type Role = "OWNER" | "EDITOR" | "VIEWER";
type UserOption = { id: string; name: string | null; email: string };
type TeamOption = { id: string; name: string; members: { userId: string; expiresAt: string | null }[] };
type PermissionsData = {
  space: {
    id: string;
    name: string;
    imageMime: string | null;
    memberships: { userId: string; role: Role }[];
    teamAccess: { teamId: string; role: Role }[];
  };
  users: UserOption[];
  teams: TeamOption[];
  canManageTeams: boolean;
};

export function SpacePermissionsDialog({
  spaceId,
  currentUserId,
  onClose,
}: {
  spaceId: string;
  currentUserId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PermissionsData | null>(null);
  const [tab, setTab] = useState<"users" | "teams" | "image">("users");
  const [userRoles, setUserRoles] = useState<Record<string, Role | "NONE">>({});
  const [teamRoles, setTeamRoles] = useState<Record<string, "EDITOR" | "VIEWER" | "NONE">>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageVersion, setImageVersion] = useState(Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    const response = await fetch(`/api/spaces/${spaceId}/permissions`);
    const result = await response.json();
    if (!response.ok) return setError(result.error || "Rechte konnten nicht geladen werden.");
    const permissions = result as PermissionsData;
    setData(permissions);
    setUserRoles(Object.fromEntries(permissions.users.map((user) => [
      user.id,
      permissions.space.memberships.find((grant) => grant.userId === user.id)?.role || "NONE",
    ])));
    setTeamRoles(Object.fromEntries(permissions.teams.map((team) => {
      const role = permissions.space.teamAccess.find((grant) => grant.teamId === team.id)?.role;
      return [team.id, role === "VIEWER" ? "VIEWER" : role ? "EDITOR" : "NONE"];
    })));
  }

  useEffect(() => {
    void load();
  }, [spaceId]);

  async function savePermissions() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/spaces/${spaceId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        users: Object.entries(userRoles).filter(([, role]) => role !== "NONE").map(([id, role]) => ({ id, role })),
        teams: Object.entries(teamRoles).filter(([, role]) => role !== "NONE").map(([id, role]) => ({ id, role })),
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Rechte konnten nicht gespeichert werden.");
    onClose();
  }

  async function uploadImage() {
    if (!imageFile) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("image", imageFile);
    const response = await fetch(`/api/spaces/${spaceId}/image`, { method: "PUT", body: form });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "Bild konnte nicht gespeichert werden.");
    setData((current) => current ? { ...current, space: { ...current.space, imageMime: imageFile.type } } : current);
    setImageFile(null);
    setImageVersion(Date.now());
  }

  async function removeImage() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/spaces/${spaceId}/image`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json();
      return setError(result.error || "Bild konnte nicht entfernt werden.");
    }
    setData((current) => current ? { ...current, space: { ...current.space, imageMime: null } } : current);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="permissions-dialog" role="dialog" aria-modal="true" aria-labelledby="permissions-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">Bereich verwalten</span><h2 id="permissions-title">{data?.space.name || "Bereich"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={19} /></button>
        </header>
        <div className="dialog-tabs">
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>Nutzer</button>
          <button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}>Teams</button>
          <button className={tab === "image" ? "active" : ""} onClick={() => setTab("image")}>Bereichsbild</button>
        </div>
        <div className="permissions-body">
          {!data && !error && <p className="muted-copy">Einstellungen werden geladen …</p>}
          {error && <p className="admin-error">{error}</p>}
          {data && tab === "users" && (
            <div className="permission-list">
              {data.users.map((user) => (
                <div className="permission-row" key={user.id}>
                  <span className="permission-avatar">{initials(user.name || user.email)}</span>
                  <div><strong>{user.name || "Ohne Namen"}</strong><small>{user.email}</small></div>
                  <select value={userRoles[user.id] || "NONE"} disabled={user.id === currentUserId} onChange={(event) => setUserRoles((current) => ({ ...current, [user.id]: event.target.value as Role | "NONE" }))}>
                    <option value="NONE">Kein Zugriff</option><option value="VIEWER">Lesen</option><option value="EDITOR">Bearbeiten</option><option value="OWNER">Eigentümer</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {data && tab === "teams" && (
            <div className="teams-panel">
              {data.canManageTeams && <Link className="team-admin-link" href="/admin/teams"><Users size={16} /> Teams und zeitliche Mitgliedschaften verwalten</Link>}
              <div className="permission-list">
                {data.teams.map((team) => {
                  const active = team.members.filter((member) => !member.expiresAt || new Date(member.expiresAt) > new Date()).length;
                  return (
                    <div className="permission-row" key={team.id}>
                      <span className="permission-avatar team"><Users size={15} /></span>
                      <div><strong>{team.name}</strong><small>{active} aktive Mitglieder</small></div>
                      <select value={teamRoles[team.id] || "NONE"} onChange={(event) => setTeamRoles((current) => ({ ...current, [team.id]: event.target.value as "EDITOR" | "VIEWER" | "NONE" }))}>
                        <option value="NONE">Kein Zugriff</option><option value="VIEWER">Lesen</option><option value="EDITOR">Bearbeiten</option>
                      </select>
                    </div>
                  );
                })}
                {!data.teams.length && <p className="muted-copy">Noch keine Teams angelegt.</p>}
              </div>
            </div>
          )}
          {data && tab === "image" && (
            <div className="space-image-panel">
              <div className="space-image-preview">
                {data.space.imageMime
                  ? <img src={`/api/spaces/${spaceId}/image?v=${imageVersion}`} alt="" />
                  : <ImagePlus size={32} />}
              </div>
              <div>
                <h3>Bild für diesen Bereich</h3>
                <p>Erlaubt sind JPG und PNG bis 5 MB. Nur Eigentümer und Administratoren können es ändern.</p>
                <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
                <div className="image-actions">
                  <button className="button primary-button compact" disabled={!imageFile || busy} onClick={uploadImage}>Bild speichern</button>
                  {data.space.imageMime && <button className="button secondary-button compact" disabled={busy} onClick={removeImage}>Bild entfernen</button>}
                </div>
              </div>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <span><Check size={14} /> Änderungen gelten für den gesamten Bereich.</span>
          <div>
            <button className="button secondary-button compact" onClick={onClose}>Abbrechen</button>
            {tab !== "image" && <button className="button primary-button compact" disabled={busy || !data} onClick={savePermissions}>{busy ? "Speichern …" : "Rechte speichern"}</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
