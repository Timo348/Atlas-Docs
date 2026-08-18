"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ImagePlus, Trash2, Users, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { apiErrorMessage } from "@/lib/api-errors";

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
  onDeleted,
}: {
  spaceId: string;
  currentUserId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { text } = usePreferences();
  const [data, setData] = useState<PermissionsData | null>(null);
  const [tab, setTab] = useState<"general" | "users" | "teams" | "image" | "delete">("general");
  const [spaceName, setSpaceName] = useState("");
  const [userRoles, setUserRoles] = useState<Record<string, Role | "NONE">>({});
  const [teamRoles, setTeamRoles] = useState<Record<string, "EDITOR" | "VIEWER" | "NONE">>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageVersion, setImageVersion] = useState(Date.now());
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useDialogEscape(onClose, busy);

  async function load() {
    setError("");
    const response = await fetch(`/api/spaces/${spaceId}/permissions`);
    const result = await response.json();
    if (!response.ok) {
      return setError(apiErrorMessage(result, text, {
        en: "Permissions could not be loaded.",
        de: "Rechte konnten nicht geladen werden.",
      }));
    }
    const permissions = result as PermissionsData;
    setData(permissions);
    setSpaceName(permissions.space.name);
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

  async function saveSpaceName() {
    if (!data) return;
    const name = spaceName.trim();
    if (name.length < 2 || name.length > 80 || name === data.space.name) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) {
        return setError(apiErrorMessage(result, text, {
          en: "The space name could not be saved.",
          de: "Der Bereichsname konnte nicht gespeichert werden.",
        }));
      }
      const updated = result as { id: string; name: string };
      setData((current) => current ? { ...current, space: { ...current.space, name: updated.name } } : current);
      setSpaceName(updated.name);
      setDeleteConfirmation("");
      onClose();
    } catch {
      setError(text("The space name could not be saved.", "Der Bereichsname konnte nicht gespeichert werden."));
    } finally {
      setBusy(false);
    }
  }

  async function savePermissions() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/spaces/${spaceId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          users: Object.entries(userRoles).filter(([, role]) => role !== "NONE").map(([id, role]) => ({ id, role })),
          teams: Object.entries(teamRoles).filter(([, role]) => role !== "NONE").map(([id, role]) => ({ id, role })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        return setError(apiErrorMessage(result, text, {
          en: "Permissions could not be saved.",
          de: "Rechte konnten nicht gespeichert werden.",
        }));
      }
      onClose();
    } catch {
      setError(text("Permissions could not be saved.", "Rechte konnten nicht gespeichert werden."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage() {
    if (!imageFile) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("image", imageFile);
      const response = await fetch(`/api/spaces/${spaceId}/image`, { method: "PUT", body: form });
      const result = await response.json();
      if (!response.ok) {
        return setError(apiErrorMessage(result, text, {
          en: "Image could not be saved.",
          de: "Bild konnte nicht gespeichert werden.",
        }));
      }
      setData((current) => current ? { ...current, space: { ...current.space, imageMime: imageFile.type } } : current);
      setImageFile(null);
      setImageVersion(Date.now());
    } catch {
      setError(text("Image could not be saved.", "Bild konnte nicht gespeichert werden."));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/spaces/${spaceId}/image`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        return setError(apiErrorMessage(result, text, {
          en: "Image could not be removed.",
          de: "Bild konnte nicht entfernt werden.",
        }));
      }
      setData((current) => current ? { ...current, space: { ...current.space, imageMime: null } } : current);
    } catch {
      setError(text("Image could not be removed.", "Bild konnte nicht entfernt werden."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSpace() {
    if (!data || deleteConfirmation !== data.space.name) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/spaces/${spaceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      if (response.ok) {
        onDeleted();
        return;
      }
      const result = await response.json();
      setError(apiErrorMessage(result, text, {
        en: "Space could not be deleted.",
        de: "Bereich konnte nicht gelöscht werden.",
      }));
    } catch {
      setError(text("Space could not be deleted.", "Bereich konnte nicht gelöscht werden."));
    } finally {
      setBusy(false);
    }
  }

  const trimmedSpaceName = spaceName.trim();
  const canSaveSpaceName = Boolean(
    data
    && trimmedSpaceName.length >= 2
    && trimmedSpaceName.length <= 80
    && trimmedSpaceName !== data.space.name,
  );

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="permissions-dialog" role="dialog" aria-modal="true" aria-labelledby="permissions-title">
        <header className="dialog-header">
          <div><span className="dialog-kicker">{text("Manage space", "Bereich verwalten")}</span><h2 id="permissions-title">{data?.space.name || text("Space", "Bereich")}</h2></div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label={text("Close", "Schließen")}><X size={19} /></button>
        </header>
        <div className="dialog-tabs">
          <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>{text("General", "Allgemein")}</button>
          <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>{text("Users", "Benutzer")}</button>
          <button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}>{text("Teams", "Teams")}</button>
          <button className={tab === "image" ? "active" : ""} onClick={() => setTab("image")}>{text("Space image", "Bereichsbild")}</button>
          <button className={tab === "delete" ? "active danger-tab" : "danger-tab"} onClick={() => setTab("delete")}>{text("Delete", "Löschen")}</button>
        </div>
        <div className="permissions-body">
          {!data && !error && <p className="muted-copy">{text("Loading settings …", "Einstellungen werden geladen …")}</p>}
          {error && <p className="admin-error">{error}</p>}
          {data && tab === "general" && (
            <div className="space-general-panel">
              <div>
                <h3>{text("Space details", "Bereichsdetails")}</h3>
                <p>{text(
                  "Changing the name updates how this space appears without changing its links or stored content.",
                  "Der neue Name wird überall angezeigt, ohne Links oder gespeicherte Inhalte zu verändern.",
                )}</p>
              </div>
              <label>
                {text("Space name", "Bereichsname")}
                <input
                  autoFocus
                  value={spaceName}
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy}
                  onChange={(event) => setSpaceName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && canSaveSpaceName && void saveSpaceName()}
                  aria-label={text("Space name", "Bereichsname")}
                />
                <small>{text("Between 2 and 80 characters.", "Zwischen 2 und 80 Zeichen.")}</small>
              </label>
            </div>
          )}
          {data && tab === "users" && (
            <div className="permission-list">
              {data.users.map((user) => (
                <div className="permission-row" key={user.id}>
                  <span className="permission-avatar">{initials(user.name || user.email)}</span>
                  <div><strong>{user.name || text("No name", "Ohne Namen")}</strong><small>{user.email}</small></div>
                  <select
                    value={userRoles[user.id] || "NONE"}
                    disabled={user.id === currentUserId}
                    onChange={(event) => setUserRoles((current) => ({ ...current, [user.id]: event.target.value as Role | "NONE" }))}
                    aria-label={text(`Access for ${user.name || user.email}`, `Zugriff für ${user.name || user.email}`)}
                  >
                    <option value="NONE">{text("No access", "Kein Zugriff")}</option><option value="VIEWER">{text("Read", "Lesen")}</option><option value="EDITOR">{text("Edit", "Bearbeiten")}</option><option value="OWNER">{text("Owner", "Eigentümer")}</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {data && tab === "teams" && (
            <div className="teams-panel">
              {data.canManageTeams && <Link className="team-admin-link" href="/admin/teams"><Users size={16} /> {text("Manage teams and temporary memberships", "Teams und zeitlich begrenzte Mitgliedschaften verwalten")}</Link>}
              <div className="permission-list">
                {data.teams.map((team) => {
                  const active = team.members.filter((member) => !member.expiresAt || new Date(member.expiresAt) > new Date()).length;
                  return (
                    <div className="permission-row" key={team.id}>
                      <span className="permission-avatar team"><Users size={15} /></span>
                      <div><strong>{team.name}</strong><small>{active === 1
                        ? text("1 active member", "1 aktives Mitglied")
                        : text(`${active} active members`, `${active} aktive Mitglieder`)}</small></div>
                      <select
                        value={teamRoles[team.id] || "NONE"}
                        onChange={(event) => setTeamRoles((current) => ({ ...current, [team.id]: event.target.value as "EDITOR" | "VIEWER" | "NONE" }))}
                        aria-label={text(`Access for team ${team.name}`, `Zugriff für Team ${team.name}`)}
                      >
                        <option value="NONE">{text("No access", "Kein Zugriff")}</option><option value="VIEWER">{text("Read", "Lesen")}</option><option value="EDITOR">{text("Edit", "Bearbeiten")}</option>
                      </select>
                    </div>
                  );
                })}
                {!data.teams.length && <p className="muted-copy">{text("No teams have been created yet.", "Noch keine Teams angelegt.")}</p>}
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
                <h3>{text("Image for this space", "Bild für diesen Bereich")}</h3>
                <p>{text(
                  "JPG and PNG images up to 5 MB are allowed. Only owners and administrators can change this image.",
                  "Erlaubt sind JPG- und PNG-Bilder bis 5 MB. Nur Eigentümer und Administratoren können dieses Bild ändern.",
                )}</p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                  aria-label={text("Choose space image", "Bereichsbild auswählen")}
                />
                <div className="image-actions">
                  <button className="button primary-button compact" disabled={!imageFile || busy} onClick={uploadImage}>{text("Save image", "Bild speichern")}</button>
                  {data.space.imageMime && <button className="button secondary-button compact" disabled={busy} onClick={removeImage}>{text("Remove image", "Bild entfernen")}</button>}
                </div>
              </div>
            </div>
          )}
          {data && tab === "delete" && (
            <div className="space-delete-panel">
              <div className="space-delete-heading">
                <span><Trash2 size={20} /></span>
                <div>
                  <h3>{text("Permanently delete space", "Bereich dauerhaft löschen")}</h3>
                  <p>{text(
                    "All pages, folders, images, versions, and permissions in this space will be permanently deleted.",
                    "Alle Seiten, Ordner, Bilder, Versionen und Freigaben in diesem Bereich werden unwiderruflich gelöscht.",
                  )}</p>
                </div>
              </div>
              <label>
                {text("Enter", "Gib")} <strong>{data.space.name}</strong> {text("to confirm.", "zur Bestätigung ein.")}
                <input
                  autoFocus
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button
                className="button danger-button compact"
                disabled={busy || deleteConfirmation !== data.space.name}
                onClick={() => void deleteSpace()}
              >
                <Trash2 size={15} />
                {busy
                  ? text("Deleting space …", "Bereich wird gelöscht …")
                  : text("Permanently delete space", "Bereich endgültig löschen")}
              </button>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <span>
            {tab === "delete"
              ? <><Trash2 size={14} /> {text("Deletion cannot be undone.", "Löschen kann nicht rückgängig gemacht werden.")}</>
              : <><Check size={14} /> {text("Changes apply to the entire space.", "Änderungen gelten für den gesamten Bereich.")}</>}
          </span>
          <div>
            <button className="button secondary-button compact" disabled={busy} onClick={onClose}>{text("Cancel", "Abbrechen")}</button>
            {tab === "general" && <button className="button primary-button compact" disabled={busy || !canSaveSpaceName} onClick={() => void saveSpaceName()}>{busy ? text("Saving …", "Speichern …") : text("Save name", "Namen speichern")}</button>}
            {(tab === "users" || tab === "teams") && <button className="button primary-button compact" disabled={busy || !data} onClick={savePermissions}>{busy ? text("Saving …", "Speichern …") : text("Save permissions", "Rechte speichern")}</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
