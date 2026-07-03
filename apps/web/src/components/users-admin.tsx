"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MEMBER";
  active: boolean;
  createdAt: string;
  accounts: { provider: string }[];
};

export function UsersAdmin({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (!response.ok) return setError(data.error || "Benutzer konnte nicht angelegt werden.");
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
    if (!response.ok) return setError(data.error || "Änderung fehlgeschlagen.");
    setUsers((current) => current.map((user) => user.id === id ? { ...user, ...data } : user));
  }

  async function resetPassword(id: string) {
    const password = window.prompt("Neues Passwort (mindestens 12 Zeichen)");
    if (!password) return;
    await updateUser(id, { password });
  }

  return (
    <section className="users-card">
      <div className="users-toolbar">
        <div><strong>{users.length} Konten</strong><span>Lokale und über OIDC verbundene Benutzer</span></div>
        <button className="button primary-button compact" onClick={() => setShowForm((value) => !value)}><Plus size={17} /> Benutzer anlegen</button>
      </div>
      {showForm && (
        <form className="new-user-form" onSubmit={createUser}>
          <label>Name<input name="name" required minLength={2} /></label>
          <label>E-Mail<input name="email" type="email" required /></label>
          <label>Startpasswort<input name="password" type="password" minLength={12} required /></label>
          <label>Rolle<select name="role"><option value="MEMBER">Mitglied</option><option value="ADMIN">Administrator</option></select></label>
          <button className="button primary-button compact" disabled={busy}>{busy ? "Anlegen …" : "Speichern"}</button>
        </form>
      )}
      {error && <p className="admin-error">{error}</p>}
      <div className="user-table">
        <div className="user-table-head"><span>Benutzer</span><span>Anmeldung</span><span>Rolle</span><span>Status</span><span /></div>
        {users.map((user) => (
          <div className="user-table-row" key={user.id}>
            <div><strong>{user.name || "Ohne Namen"}{user.id === currentUserId && <em>Du</em>}</strong><small>{user.email}</small></div>
            <span>{user.accounts.length ? user.accounts.map((account) => account.provider).join(", ") : "Lokal"}</span>
            <select
              value={user.role}
              disabled={user.id === currentUserId}
              onChange={(event) => updateUser(user.id, { role: event.target.value as "ADMIN" | "MEMBER" })}
            >
              <option value="MEMBER">Mitglied</option><option value="ADMIN">Administrator</option>
            </select>
            <span className={`status-pill ${user.active ? "enabled" : "disabled"}`}>{user.active ? "Aktiv" : "Gesperrt"}</span>
            <div className="row-actions">
              <button className="icon-button bordered" onClick={() => resetPassword(user.id)} title="Lokales Passwort setzen"><KeyRound size={16} /></button>
              <button
                className="icon-button bordered"
                disabled={user.id === currentUserId}
                onClick={() => updateUser(user.id, { active: !user.active })}
                title={user.active ? "Konto sperren" : "Konto aktivieren"}
              >
                {user.active ? <UserX size={17} /> : <UserCheck size={17} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
