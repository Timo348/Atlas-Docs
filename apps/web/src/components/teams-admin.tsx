"use client";

import { useMemo, useState } from "react";
import { Clock3, Plus, Save, Trash2, Users } from "lucide-react";

type UserOption = { id: string; name: string | null; email: string };
type Team = {
  id: string;
  name: string;
  members: { userId: string; expiresAt: string | null }[];
  spaces: { role: string; space: { id: string; name: string } }[];
};
type Draft = { id: string | null; name: string; members: Record<string, string> };

export function TeamsAdmin({ users, initialTeams }: { users: UserOption[]; initialTeams: Team[] }) {
  const [teams, setTeams] = useState(initialTeams);
  const [selectedId, setSelectedId] = useState<string | null>(initialTeams[0]?.id || null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialTeams[0] || null));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const selected = teams.find((team) => team.id === selectedId) || null;
  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => !needle || (user.name || "").toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle));
  }, [query, users]);

  function selectTeam(team: Team) {
    setSelectedId(team.id);
    setDraft(toDraft(team));
    setDeleteArmed(false);
    setError("");
  }

  function startNew() {
    setSelectedId(null);
    setDraft(toDraft(null));
    setDeleteArmed(false);
    setError("");
  }

  function toggleMember(userId: string) {
    setDraft((current) => {
      const members = { ...current.members };
      if (userId in members) delete members[userId];
      else members[userId] = "";
      return { ...current, members };
    });
  }

  async function save() {
    if (draft.name.trim().length < 2) return setError("Der Teamname benötigt mindestens zwei Zeichen.");
    setBusy(true);
    setError("");
    const body = {
      name: draft.name.trim(),
      members: Object.entries(draft.members).map(([userId, localExpiry]) => ({
        userId,
        expiresAt: localExpiry ? new Date(localExpiry).toISOString() : null,
      })),
    };
    const response = await fetch(draft.id ? `/api/teams/${draft.id}` : "/api/teams", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setBusy(false);
      return setError(result.error || "Team konnte nicht gespeichert werden.");
    }
    const refreshed = await fetch("/api/teams").then((value) => value.json()) as Team[];
    setTeams(refreshed);
    const nextId = draft.id || result.id;
    const next = refreshed.find((team) => team.id === nextId) || null;
    setSelectedId(nextId);
    setDraft(toDraft(next));
    setBusy(false);
  }

  async function remove() {
    if (!draft.id) return;
    if (!deleteArmed) return setDeleteArmed(true);
    setBusy(true);
    const response = await fetch(`/api/teams/${draft.id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json();
      setBusy(false);
      return setError(result.error || "Team konnte nicht gelöscht werden.");
    }
    const nextTeams = teams.filter((team) => team.id !== draft.id);
    setTeams(nextTeams);
    const next = nextTeams[0] || null;
    setSelectedId(next?.id || null);
    setDraft(toDraft(next));
    setBusy(false);
    setDeleteArmed(false);
  }

  return (
    <section className="teams-admin">
      <aside className="teams-overview">
        <button className="button primary-button compact" onClick={startNew}><Plus size={16} /> Neues Team</button>
        <div className="team-cards">
          {teams.map((team) => (
            <button className={team.id === selectedId ? "active" : ""} key={team.id} onClick={() => selectTeam(team)}>
              <span><Users size={17} /></span>
              <div><strong>{team.name}</strong><small>{activeMembers(team)} aktive Mitglieder · {team.spaces.length} Bereiche</small></div>
            </button>
          ))}
          {!teams.length && <p className="muted-copy">Noch keine Teams vorhanden.</p>}
        </div>
      </aside>
      <div className="team-editor-card">
        <header>
          <div>
            <span className="dialog-kicker">{draft.id ? "Team bearbeiten" : "Team erstellen"}</span>
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Name des Teams" />
          </div>
          {selected?.spaces.length ? (
            <div className="team-space-tags">{selected.spaces.map((grant) => <span key={grant.space.id}>{grant.space.name} · {grant.role === "EDITOR" ? "Bearbeiten" : "Lesen"}</span>)}</div>
          ) : null}
        </header>
        <div className="team-user-toolbar">
          <div><strong>Benutzer zuweisen</strong><small>Ohne Ablaufdatum bleibt die Mitgliedschaft dauerhaft aktiv.</small></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Benutzer suchen …" />
        </div>
        <div className="team-user-list">
          {filteredUsers.map((user) => {
            const checked = user.id in draft.members;
            return (
              <div className="team-user-row" key={user.id}>
                <label>
                  <input type="checkbox" checked={checked} onChange={() => toggleMember(user.id)} />
                  <span className="permission-avatar">{initials(user.name || user.email)}</span>
                  <span><strong>{user.name || "Ohne Namen"}</strong><small>{user.email}</small></span>
                </label>
                <div className="expiry-field">
                  <Clock3 size={15} />
                  <input
                    type="datetime-local"
                    disabled={!checked}
                    value={draft.members[user.id] || ""}
                    min={toLocalInput(new Date())}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      members: { ...current.members, [user.id]: event.target.value },
                    }))}
                    aria-label={`Ablaufdatum für ${user.name || user.email}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="admin-error">{error}</p>}
        <footer>
          {draft.id && (
            <button className={`button compact ${deleteArmed ? "danger-button" : "secondary-button"}`} disabled={busy} onClick={remove}>
              <Trash2 size={15} /> {deleteArmed ? "Löschen bestätigen" : "Team löschen"}
            </button>
          )}
          <button className="button primary-button compact" disabled={busy} onClick={save}><Save size={15} /> {busy ? "Speichern …" : "Team speichern"}</button>
        </footer>
      </div>
    </section>
  );
}

function toDraft(team: Team | null): Draft {
  return {
    id: team?.id || null,
    name: team?.name || "",
    members: Object.fromEntries((team?.members || []).map((member) => [
      member.userId,
      member.expiresAt ? toLocalInput(new Date(member.expiresAt)) : "",
    ])),
  };
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function activeMembers(team: Team) {
  const now = Date.now();
  return team.members.filter((member) => !member.expiresAt || new Date(member.expiresAt).getTime() > now).length;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
