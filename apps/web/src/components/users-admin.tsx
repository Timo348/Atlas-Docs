"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, Plus, ShieldCheck, UserCheck, UserX, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { apiErrorMessage } from "@/lib/api-errors";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MEMBER";
  active: boolean;
  createdAt: string;
  accounts: { provider: string }[];
};

export function UsersAdminPage({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const { text } = usePreferences();
  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow dark"><ShieldCheck size={15} /> {text("Administration", "Administration")}</p>
          <h1>{text("User management", "Benutzerverwaltung")}</h1>
        </div>
        <Link href="/" className="button secondary-button">
          <ArrowLeft size={16} /> {text("Back to workspace", "Zurück zum Workspace")}
        </Link>
      </header>
      <UsersAdmin initialUsers={initialUsers} currentUserId={currentUserId} />
    </main>
  );
}

export function UsersAdmin({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const { text } = usePreferences();
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  function closeResetDialog() {
    setResetUserId(null);
    setNewPassword("");
  }

  useDialogEscape(closeResetDialog, resetBusy, Boolean(resetUserId));

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
      }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      return setError(apiErrorMessage(data, text, {
        en: "User could not be created.",
        de: "Benutzer konnte nicht angelegt werden.",
      }));
    }
    setUsers((current) => [...current, { ...data, createdAt: new Date().toISOString(), accounts: [] }]);
    setShowForm(false);
  }

  async function updateUser(id: string, patch: { active?: boolean; role?: "ADMIN" | "MEMBER"; password?: string }) {
    setError("");
    const response = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(apiErrorMessage(data, text, {
        en: "The change could not be saved.",
        de: "Die Änderung konnte nicht gespeichert werden.",
      }));
      return false;
    }
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...data } : user));
    return true;
  }

  async function resetPassword() {
    if (!resetUserId || newPassword.length < 12) return;
    setResetBusy(true);
    try {
      if (await updateUser(resetUserId, { password: newPassword })) {
        closeResetDialog();
      }
    } catch {
      setError(text("The password could not be saved.", "Das Passwort konnte nicht gespeichert werden."));
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <section className="users-card">
      <div className="users-toolbar">
        <div>
          <strong>{users.length === 1 ? text("1 account", "1 Konto") : text(`${users.length} accounts`, `${users.length} Konten`)}</strong>
          <span>{text("Local users and users connected through OIDC", "Lokale und über OIDC verbundene Benutzer")}</span>
        </div>
        <button className="button primary-button compact" onClick={() => setShowForm((value) => !value)}>
          <Plus size={17} /> {text("Create user", "Benutzer anlegen")}
        </button>
      </div>
      {showForm && (
        <form className="new-user-form" onSubmit={createUser}>
          <label>{text("Name", "Name")}<input name="name" required minLength={2} /></label>
          <label>{text("Email", "E-Mail")}<input name="email" type="email" required /></label>
          <label>{text("Initial password", "Startpasswort")}<input name="password" type="password" minLength={12} required /></label>
          <label>{text("Role", "Rolle")}<select name="role"><option value="MEMBER">{text("Member", "Mitglied")}</option><option value="ADMIN">{text("Administrator", "Administrator")}</option></select></label>
          <button className="button primary-button compact" disabled={busy}>
            {busy ? text("Creating …", "Wird angelegt …") : text("Create", "Anlegen")}
          </button>
        </form>
      )}
      {error && <p className="admin-error">{error}</p>}
      <div className="user-table">
        <div className="user-table-head">
          <span>{text("User", "Benutzer")}</span>
          <span>{text("Sign-in", "Anmeldung")}</span>
          <span>{text("Role", "Rolle")}</span>
          <span>{text("Status", "Status")}</span>
          <span />
        </div>
        {users.map((user) => (
          <div className="user-table-row" key={user.id}>
            <div>
              <strong>
                {user.name || text("No name", "Ohne Namen")}
                {user.id === currentUserId && <em>{text("You", "Du")}</em>}
              </strong>
              <small>{user.email}</small>
            </div>
            <span>{user.accounts.length ? user.accounts.map((account) => account.provider).join(", ") : text("Local", "Lokal")}</span>
            <select
              value={user.role}
              disabled={user.id === currentUserId}
              onChange={(event) => updateUser(user.id, { role: event.target.value as "ADMIN" | "MEMBER" })}
              aria-label={text(`Role for ${user.name || user.email}`, `Rolle für ${user.name || user.email}`)}
            >
              <option value="MEMBER">{text("Member", "Mitglied")}</option><option value="ADMIN">{text("Administrator", "Administrator")}</option>
            </select>
            <span className={`status-pill ${user.active ? "enabled" : "disabled"}`}>
              {user.active ? text("Active", "Aktiv") : text("Locked", "Gesperrt")}
            </span>
            <div className="row-actions">
              <button
                className="icon-button bordered"
                onClick={() => setResetUserId(user.id)}
                title={text("Set local password", "Lokales Passwort setzen")}
                aria-label={text(`Set local password for ${user.name || user.email}`, `Lokales Passwort für ${user.name || user.email} setzen`)}
              >
                <KeyRound size={16} />
              </button>
              <button
                className="icon-button bordered"
                disabled={user.id === currentUserId}
                onClick={() => updateUser(user.id, { active: !user.active })}
                title={user.active ? text("Lock account", "Konto sperren") : text("Activate account", "Konto aktivieren")}
                aria-label={user.active
                  ? text(`Lock account for ${user.name || user.email}`, `Konto von ${user.name || user.email} sperren`)
                  : text(`Activate account for ${user.name || user.email}`, `Konto von ${user.name || user.email} aktivieren`)}
              >
                {user.active ? <UserX size={17} /> : <UserCheck size={17} />}
              </button>
            </div>
          </div>
        ))}
      </div>
      {resetUserId && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !resetBusy && closeResetDialog()}>
          <section className="action-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <header className="dialog-header">
              <div>
                <span className="dialog-kicker">{text("User account", "Benutzerkonto")}</span>
                <h2 id="reset-password-title">{text("Reset password", "Passwort neu setzen")}</h2>
              </div>
              <button className="icon-button" disabled={resetBusy} onClick={closeResetDialog} aria-label={text("Close", "Schließen")}>
                <X size={18} />
              </button>
            </header>
            <div className="action-dialog-body">
              <label>{text("New password", "Neues Passwort")}<input autoFocus disabled={resetBusy} type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
            </div>
            <footer className="dialog-footer">
              <span>{text("At least 12 characters", "Mindestens 12 Zeichen")}</span>
              <div>
                <button className="button secondary-button compact" disabled={resetBusy} onClick={closeResetDialog}>{text("Cancel", "Abbrechen")}</button>
                <button className="button primary-button compact" disabled={resetBusy || newPassword.length < 12} onClick={resetPassword}>{resetBusy ? text("Saving …", "Speichern …") : text("Save", "Speichern")}</button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
