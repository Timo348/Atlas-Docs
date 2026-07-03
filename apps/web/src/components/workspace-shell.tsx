"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  BookOpen, ChevronDown, FilePlus2, Hash, LogOut, PanelLeftClose,
  PanelLeftOpen, Plus, Search, Settings, ShieldCheck,
} from "lucide-react";
import { CollaborativeEditor } from "@/components/collaborative-editor";

type PageItem = { id: string; title: string; slug: string; parentId: string | null };
type Space = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberships: { role: "OWNER" | "EDITOR" | "VIEWER" }[];
  pages: PageItem[];
};

export function WorkspaceShell({
  spaces,
  selectedPage,
  user,
}: {
  spaces: Space[];
  selectedPage: PageItem | null;
  user: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };
}) {
  const router = useRouter();
  const [sidebar, setSidebar] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  async function createPage(spaceId: string) {
    const title = window.prompt("Titel der neuen Seite");
    if (!title?.trim()) return;
    setBusy(true);
    const response = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, spaceId }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return window.alert(result.error || "Seite konnte nicht erstellt werden.");
    router.push(`/?page=${result.id}`);
    router.refresh();
  }

  async function createSpace() {
    const name = window.prompt("Name des neuen Bereichs");
    if (!name?.trim()) return;
    setBusy(true);
    const response = await fetch("/api/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return window.alert(result.error || "Bereich konnte nicht erstellt werden.");
    router.refresh();
  }

  return (
    <main className={`workspace ${sidebar ? "" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <Link href="/" className="brand"><BookOpen size={21} /> Atlas</Link>
          <button className="icon-button" onClick={() => setSidebar(false)} title="Navigation schließen">
            <PanelLeftClose size={19} />
          </button>
        </div>
        <div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Seiten suchen …" /></div>
        <nav className="space-list">
          {spaces.map((space) => {
            const canWrite = space.memberships[0]?.role !== "VIEWER";
            const pages = space.pages.filter((page) => page.title.toLowerCase().includes(query.toLowerCase()));
            return (
              <section className="space" key={space.id}>
                <div className="space-heading">
                  <span><ChevronDown size={15} />{space.name}</span>
                  {canWrite && (
                    <button className="icon-button tiny" disabled={busy} onClick={() => createPage(space.id)} title="Neue Seite">
                      <FilePlus2 size={16} />
                    </button>
                  )}
                </div>
                {pages.map((page) => (
                  <Link className={`page-link ${selectedPage?.id === page.id ? "active" : ""}`} key={page.id} href={`/?page=${page.id}`}>
                    <Hash size={14} /> <span>{page.title}</span>
                  </Link>
                ))}
              </section>
            );
          })}
          <button className="new-space" onClick={createSpace} disabled={busy}><Plus size={15} /> Neuer Bereich</button>
        </nav>
        <div className="sidebar-footer">
          {user.role === "ADMIN" && <Link className="footer-link" href="/admin/users"><ShieldCheck size={17} /> Benutzerverwaltung</Link>}
          <button className="footer-link" onClick={() => signOut({ callbackUrl: "/signin" })}><LogOut size={17} /> Abmelden</button>
          <div className="user-chip"><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
        </div>
      </aside>
      <section className="content">
        {!sidebar && <button className="open-sidebar icon-button" onClick={() => setSidebar(true)}><PanelLeftOpen size={20} /></button>}
        {selectedPage ? (
          <CollaborativeEditor key={selectedPage.id} page={selectedPage} user={user} />
        ) : (
          <div className="empty-state">
            <span><BookOpen size={28} /></span>
            <h1>Dein Wissensraum wartet.</h1>
            <p>Lege einen Bereich und anschließend deine erste Seite an.</p>
            <button className="button primary-button compact" onClick={createSpace}><Plus size={17} /> Bereich anlegen</button>
          </div>
        )}
      </section>
    </main>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
