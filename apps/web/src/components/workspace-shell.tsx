"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, FileCode2, FilePlus2, FileText, Folder,
  FolderPlus, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Pencil, Plus, Search, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { ProfileDialog } from "@/components/profile-dialog";
import { SpacePermissionsDialog } from "@/components/space-permissions-dialog";

type PageItem = {
  id: string;
  title: string;
  slug: string;
  spaceId: string;
  parentId: string | null;
  folderId: string | null;
  format: "MARKDOWN" | "LATEX";
};
type FolderItem = { id: string; name: string; parentId: string | null };
type FlatFolder = { folder: FolderItem; depth: number };
type ActionDialogState =
  | { kind: "text"; title: string; label: string; initial: string; submit: (value: string) => Promise<void> }
  | { kind: "page"; title: string; label: string; initial: string; submit: (value: string, format: "MARKDOWN" | "LATEX") => Promise<void> }
  | { kind: "confirm"; title: string; message: string; submit: () => Promise<void> }
  | { kind: "move"; title: string; folders: FlatFolder[]; currentFolderId: string | null; submit: (folderId: string | null) => Promise<void> };
type Space = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  hasImage: boolean;
  imageVersion: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
  folders: FolderItem[];
  pages: PageItem[];
};

export function WorkspaceShell({
  spaces,
  selectedSpaceId,
  selectedPage,
  user,
}: {
  spaces: Space[];
  selectedSpaceId: string | null;
  selectedPage: PageItem | null;
  user: { id: string; name: string; email: string; role: "ADMIN" | "MEMBER"; hasAvatar: boolean; avatarVersion: number };
}) {
  const router = useRouter();
  const [sidebar, setSidebar] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [spaceQuery, setSpaceQuery] = useState("");
  const [pageQuery, setPageQuery] = useState("");
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [notice, setNotice] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const activeSpace = spaces.find((space) => space.id === selectedSpaceId) || spaces[0] || null;
  const canWrite = activeSpace?.role === "OWNER" || activeSpace?.role === "EDITOR";

  const matchingSpaces = spaces.filter((space) => {
    const needle = spaceQuery.trim().toLowerCase();
    return !needle || space.name.toLowerCase().includes(needle)
      || space.description?.toLowerCase().includes(needle);
  });

  function createPage(spaceId: string, folderId: string | null = null) {
    setDialog({
      kind: "page", title: "Neue Seite", label: "Seitentitel", initial: "",
      submit: async (title, format) => {
        const response = await jsonRequest("/api/pages", "POST", { title, spaceId, folderId, format });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.push(`/?space=${spaceId}&page=${response.data.id}`);
        router.refresh();
      },
    });
  }

  function createFolder(spaceId: string, parentId: string | null = null) {
    setDialog({
      kind: "text", title: parentId ? "Neuer Unterordner" : "Neuer Ordner", label: "Ordnername", initial: "",
      submit: async (name) => {
        const response = await jsonRequest("/api/folders", "POST", { name, spaceId, parentId });
        if (!response.ok) return setNotice(response.error);
        setExpandedFolders((current) => new Set(current).add(parentId || response.data.id).add(response.data.id));
        setDialog(null);
        router.refresh();
      },
    });
  }

  function renameFolder(folder: FolderItem) {
    setDialog({
      kind: "text", title: "Ordner umbenennen", label: "Ordnername", initial: folder.name,
      submit: async (name) => {
        const response = await jsonRequest(`/api/folders/${folder.id}`, "PATCH", { name });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.refresh();
      },
    });
  }

  function deleteFolder(folder: FolderItem) {
    setDialog({
      kind: "confirm", title: "Ordner löschen",
      message: `Der Ordner „${folder.name}“ und seine Unterordner werden gelöscht. Enthaltene Seiten wechseln auf die oberste Ebene.`,
      submit: async () => {
        const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json();
          return setNotice(result.error || "Ordner konnte nicht gelöscht werden.");
        }
        setDialog(null);
        router.refresh();
      },
    });
  }

  function movePage(page: PageItem) {
    if (!activeSpace) return;
    setDialog({
      kind: "move", title: `„${page.title}“ verschieben`, folders: flattenFolders(activeSpace.folders), currentFolderId: page.folderId,
      submit: async (folderId) => {
        const response = await jsonRequest(`/api/pages/${page.id}`, "PATCH", { folderId });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.refresh();
      },
    });
  }

  function createSpace() {
    setDialog({
      kind: "text", title: "Neuer Bereich", label: "Bereichsname", initial: "",
      submit: async (name) => {
        const response = await jsonRequest("/api/spaces", "POST", { name });
        if (!response.ok) return setNotice(response.error);
        setSwitcherOpen(false);
        setDialog(null);
        router.push(`/?space=${response.data.id}`);
        router.refresh();
      },
    });
  }

  function selectSpace(space: Space) {
    setSwitcherOpen(false);
    setSpaceQuery("");
    router.push(space.pages[0]
      ? `/?space=${space.id}&page=${space.pages[0].id}`
      : `/?space=${space.id}`);
  }

  function toggleFolder(id: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <main className={`workspace ${sidebar ? "" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top workspace-top">
          <div className="space-switcher-wrap">
            <button className="space-switcher" onClick={() => setSwitcherOpen((value) => !value)}>
              <span className="space-mark">
                {activeSpace?.hasImage ? <img src={`/api/spaces/${activeSpace.id}/image?v=${activeSpace.imageVersion}`} alt="" /> : <BookOpen size={17} />}
              </span>
              <span><small>Bereich</small><strong>{activeSpace?.name || "Atlas"}</strong></span>
              <ChevronDown size={15} />
            </button>
            {switcherOpen && (
              <div className="space-popover">
                <div className="popover-title"><strong>Bereich wechseln</strong><button className="icon-button tiny" onClick={() => setSwitcherOpen(false)}><X size={15} /></button></div>
                <div className="popover-search"><Search size={15} /><input autoFocus value={spaceQuery} onChange={(event) => setSpaceQuery(event.target.value)} placeholder="Bereiche durchsuchen …" /></div>
                <div className="space-options">
                  {matchingSpaces.map((space) => (
                    <button className={space.id === activeSpace?.id ? "active" : ""} key={space.id} onClick={() => selectSpace(space)}>
                      <span>{space.hasImage ? <img src={`/api/spaces/${space.id}/image?v=${space.imageVersion}`} alt="" /> : space.name.slice(0, 1).toUpperCase()}</span>
                      <div><strong>{space.name}</strong><small>{space.description || roleLabel(space.role)}</small></div>
                      {space.id === activeSpace?.id && <span className="selected-dot" />}
                    </button>
                  ))}
                  {!matchingSpaces.length && <p>Kein Bereich gefunden.</p>}
                </div>
                <button className="create-space-button" disabled={busy} onClick={createSpace}><Plus size={15} /> Neuen Bereich anlegen</button>
              </div>
            )}
          </div>
          <button className="icon-button" onClick={() => setSidebar(false)} title="Navigation schließen">
            <PanelLeftClose size={19} />
          </button>
        </div>

        {activeSpace && (
          <>
            <div className="space-toolbar">
              <span>{roleLabel(activeSpace.role)}</span>
              {(activeSpace.role === "OWNER" || user.role === "ADMIN") && (
                <button className="icon-button tiny" onClick={() => setPermissionsOpen(true)} title="Bereichsrechte">
                  <Users size={16} />
                </button>
              )}
            </div>
            <div className="search-box"><Search size={16} /><input value={pageQuery} onChange={(event) => setPageQuery(event.target.value)} placeholder="In diesem Bereich suchen …" /></div>
            <nav className="page-tree">
              {canWrite && (
                <div className="tree-actions">
                  <button disabled={busy} onClick={() => createPage(activeSpace.id)}><FilePlus2 size={15} /> Seite</button>
                  <button disabled={busy} onClick={() => createFolder(activeSpace.id)}><FolderPlus size={15} /> Ordner</button>
                </div>
              )}
              <FolderTree
                space={activeSpace}
                parentId={null}
                query={pageQuery}
                selectedPageId={selectedPage?.id || null}
                expanded={expandedFolders}
                canWrite={Boolean(canWrite)}
                busy={busy}
                onToggle={toggleFolder}
                onCreatePage={createPage}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onMovePage={movePage}
              />
              <RootPages
                pages={activeSpace.pages.filter((page) => !page.folderId)}
                query={pageQuery}
                selectedPageId={selectedPage?.id || null}
                canWrite={Boolean(canWrite)}
                onMovePage={movePage}
              />
              {!activeSpace.pages.length && !activeSpace.folders.length && (
                <div className="tree-empty"><Folder size={20} /><span>Noch keine Inhalte</span></div>
              )}
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          {user.role === "ADMIN" && <Link className="footer-link" href="/admin/users"><ShieldCheck size={17} /> Benutzerverwaltung</Link>}
          {user.role === "ADMIN" && <Link className="footer-link" href="/admin/teams"><Users size={17} /> Teamverwaltung</Link>}
          <button className="footer-link" onClick={() => signOut({ callbackUrl: "/signin" })}><LogOut size={17} /> Abmelden</button>
          <button className="user-chip user-chip-button" onClick={() => setProfileOpen(true)}>
            <span>{user.hasAvatar ? <img src={`/api/users/${user.id}/avatar?v=${user.avatarVersion}`} alt="" /> : initials(user.name)}</span>
            <div><strong>{user.name}</strong><small>{user.email}</small></div>
          </button>
        </div>
      </aside>
      <section className="content">
        {!sidebar && <button className="open-sidebar icon-button" onClick={() => setSidebar(true)}><PanelLeftOpen size={20} /></button>}
        {selectedPage ? (
          <CollaborativeEditor key={selectedPage.id} page={selectedPage} user={user} />
        ) : (
          <div className="empty-state">
            <span>{activeSpace ? <Folder size={28} /> : <BookOpen size={28} />}</span>
            <h1>{activeSpace ? activeSpace.name : "Dein Wissensraum wartet."}</h1>
            <p>{activeSpace ? "Lege eine Seite oder einen Ordner an." : "Lege deinen ersten Bereich an."}</p>
            {activeSpace && canWrite ? (
              <button className="button primary-button compact" onClick={() => createPage(activeSpace.id)}><Plus size={17} /> Erste Seite</button>
            ) : !activeSpace ? (
              <button className="button primary-button compact" onClick={createSpace}><Plus size={17} /> Bereich anlegen</button>
            ) : null}
          </div>
        )}
      </section>
      {permissionsOpen && activeSpace && (
        <SpacePermissionsDialog
          spaceId={activeSpace.id}
          currentUserId={user.id}
          onClose={() => {
            setPermissionsOpen(false);
            router.refresh();
          }}
        />
      )}
      {profileOpen && <ProfileDialog user={user} onClose={() => { setProfileOpen(false); router.refresh(); }} />}
      {dialog && <ActionDialog key={`${dialog.kind}:${dialog.title}`} dialog={dialog} busy={busy} onBusy={setBusy} onClose={() => setDialog(null)} />}
      {notice && <button className="atlas-toast" onClick={() => setNotice("")}>{notice}<X size={14} /></button>}
    </main>
  );
}

function FolderTree({
  space,
  parentId,
  query,
  selectedPageId,
  expanded,
  canWrite,
  busy,
  onToggle,
  onCreatePage,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMovePage,
}: {
  space: Space;
  parentId: string | null;
  query: string;
  selectedPageId: string | null;
  expanded: Set<string>;
  canWrite: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onCreatePage: (spaceId: string, folderId: string | null) => void;
  onCreateFolder: (spaceId: string, parentId: string | null) => void;
  onRenameFolder: (folder: FolderItem) => void;
  onDeleteFolder: (folder: FolderItem) => void;
  onMovePage: (page: PageItem) => void;
}) {
  const folders = space.folders.filter((folder) => folder.parentId === parentId);
  return (
    <>
      {folders.map((folder) => {
        if (query && !folderMatches(folder.id, space, query)) return null;
        const isOpen = expanded.has(folder.id) || Boolean(query);
        const pages = space.pages.filter((page) => page.folderId === folder.id);
        return (
          <div className="folder-node" key={folder.id}>
            <div className="folder-row">
              <button className="folder-toggle" onClick={() => onToggle(folder.id)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {isOpen ? <Folder size={15} /> : <Folder size={15} />}
                <span>{folder.name}</span>
              </button>
              {canWrite && (
                <div className="node-actions">
                  <button disabled={busy} onClick={() => onCreatePage(space.id, folder.id)} title="Seite im Ordner"><FilePlus2 size={14} /></button>
                  <button disabled={busy} onClick={() => onCreateFolder(space.id, folder.id)} title="Unterordner"><FolderPlus size={14} /></button>
                  <button disabled={busy} onClick={() => onRenameFolder(folder)} title="Umbenennen"><Pencil size={13} /></button>
                  <button disabled={busy} onClick={() => onDeleteFolder(folder)} title="Löschen"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
            {isOpen && (
              <div className="folder-children">
                <FolderTree
                  space={space}
                  parentId={folder.id}
                  query={query}
                  selectedPageId={selectedPageId}
                  expanded={expanded}
                  canWrite={canWrite}
                  busy={busy}
                  onToggle={onToggle}
                  onCreatePage={onCreatePage}
                  onCreateFolder={onCreateFolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  onMovePage={onMovePage}
                />
                <RootPages pages={pages} query={query} selectedPageId={selectedPageId} canWrite={canWrite} onMovePage={onMovePage} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function RootPages({
  pages,
  query,
  selectedPageId,
  canWrite,
  onMovePage,
}: {
  pages: PageItem[];
  query: string;
  selectedPageId: string | null;
  canWrite: boolean;
  onMovePage: (page: PageItem) => void;
}) {
  const needle = query.trim().toLowerCase();
  return (
    <>
      {pages.filter((page) => !needle || page.title.toLowerCase().includes(needle)).map((page) => (
        <div className={`page-row ${selectedPageId === page.id ? "active" : ""}`} key={page.id}>
          <Link className="page-link" href={`/?space=${page.spaceId}&page=${page.id}`}>
            {page.format === "LATEX" ? <FileCode2 size={14} /> : <FileText size={14} />}<span>{page.title}</span>
          </Link>
          {canWrite && <button onClick={() => onMovePage(page)} title="Seite verschieben"><MoreHorizontal size={15} /></button>}
        </div>
      ))}
    </>
  );
}

function folderMatches(folderId: string, space: Space, query: string): boolean {
  const needle = query.trim().toLowerCase();
  const folder = space.folders.find((item) => item.id === folderId);
  if (folder?.name.toLowerCase().includes(needle)) return true;
  if (space.pages.some((page) => page.folderId === folderId && page.title.toLowerCase().includes(needle))) return true;
  return space.folders.some((child) => child.parentId === folderId && folderMatches(child.id, space, query));
}

function flattenFolders(folders: FolderItem[]) {
  const result: { folder: FolderItem; depth: number }[] = [];
  function visit(parentId: string | null, depth: number) {
    folders.filter((folder) => folder.parentId === parentId).forEach((folder) => {
      result.push({ folder, depth });
      visit(folder.id, depth + 1);
    });
  }
  visit(null, 0);
  return result;
}

function roleLabel(role: Space["role"]) {
  return role === "OWNER" ? "Eigentümer" : role === "EDITOR" ? "Bearbeiten" : "Nur lesen";
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ActionDialog({
  dialog,
  busy,
  onBusy,
  onClose,
}: {
  dialog: ActionDialogState;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.kind === "text" || dialog.kind === "page" ? dialog.initial : dialog.kind === "move" ? dialog.currentFolderId || "" : "");
  const [format, setFormat] = useState<"MARKDOWN" | "LATEX">("MARKDOWN");
  async function submit() {
    onBusy(true);
    try {
      if (dialog.kind === "text") await dialog.submit(value.trim());
      else if (dialog.kind === "page") await dialog.submit(value.trim(), format);
      else if (dialog.kind === "move") await dialog.submit(value || null);
      else await dialog.submit();
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="action-dialog" role="dialog" aria-modal="true">
        <header className="dialog-header">
          <div><span className="dialog-kicker">Atlas</span><h2>{dialog.title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </header>
        <div className="action-dialog-body">
          {(dialog.kind === "text" || dialog.kind === "page") && <label>{dialog.label}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && value.trim() && void submit()} /></label>}
          {dialog.kind === "page" && (
            <div className="format-picker">
              <button className={format === "MARKDOWN" ? "active" : ""} onClick={() => setFormat("MARKDOWN")}><FileText size={20} /><span><strong>Markdown</strong><small>Flexible Dokumentation mit Vorschau</small></span></button>
              <button className={format === "LATEX" ? "active" : ""} onClick={() => setFormat("LATEX")}><FileCode2 size={20} /><span><strong>LaTeX</strong><small>Wissenschaftliche Dokumente und Formeln</small></span></button>
            </div>
          )}
          {dialog.kind === "confirm" && <p>{dialog.message}</p>}
          {dialog.kind === "move" && (
            <label>Zielordner
              <select value={value} onChange={(event) => setValue(event.target.value)}>
                <option value="">Oberste Ebene</option>
                {dialog.folders.map(({ folder, depth }) => <option value={folder.id} key={folder.id}>{"— ".repeat(depth)}{folder.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <footer className="dialog-footer">
          <span />
          <div>
            <button className="button secondary-button compact" onClick={onClose}>Abbrechen</button>
            <button className={`button compact ${dialog.kind === "confirm" ? "danger-button" : "primary-button"}`} disabled={busy || ((dialog.kind === "text" || dialog.kind === "page") && !value.trim())} onClick={() => void submit()}>
              {busy ? "Bitte warten …" : dialog.kind === "confirm" ? "Löschen" : "Speichern"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

async function jsonRequest<T extends { id: string }>(url: string, method: string, body: unknown): Promise<
  { ok: true; data: T } | { ok: false; error: string }
> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return response.ok ? { ok: true, data } : { ok: false, error: data.error || "Aktion fehlgeschlagen." };
}
