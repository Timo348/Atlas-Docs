"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { type DragEvent, useEffect, useState } from "react";
import {
  BookOpen, ChevronDown, ChevronRight, FileCode2, FilePlus2, FileText, Folder,
  FolderPlus, GripVertical, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Network, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Users, X,
} from "lucide-react";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { usePreferences } from "@/components/preferences-provider";
import { ProfileDialog } from "@/components/profile-dialog";
import { SpacePermissionsDialog } from "@/components/space-permissions-dialog";
import { SidebarSpaceIdentity, SpacePicker } from "@/components/space-picker";
import { useDialogEscape } from "@/components/use-dialog-escape";
import { apiErrorMessage } from "@/lib/api-errors";
import { pageAfterDeletion } from "@/lib/page-deletion";
import { spaceNavigationHref } from "@/lib/space-navigation";
import { spaceRoleLabel } from "@/lib/space-role";
import { workspaceShortcut } from "@/lib/workspace-shortcuts";

type PageFormat = "MARKDOWN" | "LATEX" | "CANVAS";
type PageItem = {
  id: string;
  title: string;
  slug: string;
  spaceId: string;
  parentId: string | null;
  folderId: string | null;
  format: PageFormat;
  sortOrder: number;
};
type FolderItem = { id: string; name: string; parentId: string | null; sortOrder: number };
type FlatFolder = { folder: FolderItem; depth: number };
type DragItem = { kind: "page" | "folder"; id: string };
type DropTarget =
  | { kind: "root" }
  | { kind: "folder"; id: string; edge: "before" | "inside" | "after" }
  | { kind: "page"; id: string; edge: "before" | "after" };
type ActionDialogState =
  | { kind: "text"; title: string; label: string; initial: string; submit: (value: string) => Promise<void> }
  | { kind: "page"; title: string; label: string; initial: string; submit: (value: string, format: PageFormat) => Promise<void> }
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
  const { preferences, text } = usePreferences();
  const router = useRouter();
  const [sidebar, setSidebar] = useState(true);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const [pageQuery, setPageQuery] = useState("");
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dialog, setDialog] = useState<ActionDialogState | null>(null);
  const [notice, setNotice] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const activeSpace = spaces.find((space) => space.id === selectedSpaceId) || spaces[0] || null;
  const canWrite = activeSpace?.role === "OWNER" || activeSpace?.role === "EDITOR";

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const shortcut = workspaceShortcut({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
        isComposing: event.isComposing,
        repeat: event.repeat,
      });
      if (!shortcut || busy || dialog || permissionsOpen || profileOpen || spacePickerOpen) return;
      if (shortcut === "new-file") {
        if (!activeSpace || !canWrite) return;
        event.preventDefault();
        createPage(activeSpace.id);
        return;
      }
      if (!spaces.length) return;
      event.preventDefault();
      setSpacePickerOpen(true);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeSpace, busy, canWrite, dialog, permissionsOpen, profileOpen, spacePickerOpen, spaces.length, text]);

  function request<T extends { id: string }>(url: string, method: string, body: unknown) {
    return jsonRequest<T>(url, method, body, text);
  }

  function createPage(spaceId: string, folderId: string | null = null) {
    setDialog({
      kind: "page", title: text("New file", "Neue Datei"), label: text("Title", "Titel"), initial: "",
      submit: async (title, format) => {
        const response = await request("/api/pages", "POST", { title, spaceId, folderId, format });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.push(`/?space=${spaceId}&page=${response.data.id}`);
        router.refresh();
      },
    });
  }

  function createFolder(spaceId: string, parentId: string | null = null) {
    setDialog({
      kind: "text", title: parentId ? text("New subfolder", "Neuer Unterordner") : text("New folder", "Neuer Ordner"), label: text("Folder name", "Ordnername"), initial: "",
      submit: async (name) => {
        const response = await request("/api/folders", "POST", { name, spaceId, parentId });
        if (!response.ok) return setNotice(response.error);
        setExpandedFolders((current) => new Set(current).add(parentId || response.data.id).add(response.data.id));
        setDialog(null);
        router.refresh();
      },
    });
  }

  function renameFolder(folder: FolderItem) {
    setDialog({
      kind: "text", title: text("Rename folder", "Ordner umbenennen"), label: text("Folder name", "Ordnername"), initial: folder.name,
      submit: async (name) => {
        const response = await request(`/api/folders/${folder.id}`, "PATCH", { name });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.refresh();
      },
    });
  }

  function deleteFolder(folder: FolderItem) {
    setDialog({
      kind: "confirm", title: text("Delete folder", "Ordner löschen"),
      message: text(
        `The folder “${folder.name}” and its subfolders will be deleted. Contained pages move to the top level.`,
        `Der Ordner „${folder.name}“ und seine Unterordner werden gelöscht. Enthaltene Seiten wechseln auf die oberste Ebene.`,
      ),
      submit: async () => {
        const response = await fetch(`/api/folders/${folder.id}`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json();
          return setNotice(apiErrorMessage(result, text, {
            en: "The folder could not be deleted.",
            de: "Der Ordner konnte nicht gelöscht werden.",
          }));
        }
        setDialog(null);
        router.refresh();
      },
    });
  }

  function movePage(page: PageItem) {
    if (!activeSpace) return;
    setDialog({
      kind: "move", title: text(`Move “${page.title}”`, `„${page.title}“ verschieben`), folders: flattenFolders(activeSpace.folders), currentFolderId: page.folderId,
      submit: async (folderId) => {
        const response = await request(`/api/pages/${page.id}`, "PATCH", { folderId });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.refresh();
      },
    });
  }

  function deletePage(page: PageItem) {
    setDialog({
      kind: "confirm",
      title: page.format === "CANVAS" ? text("Delete canvas", "Canvas löschen") : text("Delete page", "Seite löschen"),
      message: text(
        `“${page.title}” and its complete version history will be permanently deleted.`,
        `„${page.title}“ und die vollständige Versionshistorie werden unwiderruflich gelöscht.`,
      ),
      submit: async () => {
        const response = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          return setNotice(apiErrorMessage(result, text, {
            en: page.format === "CANVAS" ? "The canvas could not be deleted." : "The page could not be deleted.",
            de: page.format === "CANVAS" ? "Der Canvas konnte nicht gelöscht werden." : "Die Seite konnte nicht gelöscht werden.",
          }));
        }
        setDialog(null);
        if (selectedPage?.id === page.id && activeSpace) {
          const fallback = pageAfterDeletion(activeSpace.pages, page.id);
          router.replace(fallback
            ? `/?space=${activeSpace.id}&page=${fallback.id}`
            : `/?space=${activeSpace.id}`);
        }
        router.refresh();
      },
    });
  }

  function createSpace() {
    setDialog({
      kind: "text", title: text("New space", "Neuer Bereich"), label: text("Space name", "Bereichsname"), initial: "",
      submit: async (name) => {
        const response = await request("/api/spaces", "POST", { name });
        if (!response.ok) return setNotice(response.error);
        setDialog(null);
        router.push(`/?space=${response.data.id}`);
        router.refresh();
      },
    });
  }

  function selectSpace(space: Space) {
    setSpacePickerOpen(false);
    router.push(spaceNavigationHref(space));
  }

  function toggleFolder(id: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function dropTreeItem(target: DropTarget) {
    const item = dragItem;
    if (!item || !activeSpace) return;
    setBusy(true);
    try {
      if (item.kind === "page") {
        const page = activeSpace.pages.find((candidate) => candidate.id === item.id);
        if (!page) return;
        let folderId: string | null;
        let position: number;
        if (target.kind === "root") {
          folderId = null;
          position = activeSpace.pages.filter((candidate) => !candidate.folderId && candidate.id !== page.id).length;
        } else if (target.kind === "folder") {
          folderId = target.id;
          position = activeSpace.pages.filter((candidate) => candidate.folderId === folderId && candidate.id !== page.id).length;
          setExpandedFolders((current) => new Set(current).add(target.id));
        } else {
          const targetPage = activeSpace.pages.find((candidate) => candidate.id === target.id);
          if (!targetPage) return;
          folderId = targetPage.folderId;
          const siblings = activeSpace.pages.filter((candidate) => candidate.folderId === folderId && candidate.id !== page.id);
          const targetIndex = siblings.findIndex((candidate) => candidate.id === targetPage.id);
          position = targetIndex + (target.edge === "after" ? 1 : 0);
        }
        const response = await request(`/api/pages/${page.id}`, "PATCH", { folderId, position });
        if (!response.ok) setNotice(response.error);
        else router.refresh();
      } else {
        const folder = activeSpace.folders.find((candidate) => candidate.id === item.id);
        if (!folder || target.kind === "page") return;
        let parentId: string | null;
        let position: number;
        if (target.kind === "root") {
          parentId = null;
          position = activeSpace.folders.filter((candidate) => !candidate.parentId && candidate.id !== folder.id).length;
        } else if (target.edge === "inside") {
          parentId = target.id;
          position = activeSpace.folders.filter((candidate) => candidate.parentId === parentId && candidate.id !== folder.id).length;
          setExpandedFolders((current) => new Set(current).add(target.id));
        } else {
          const targetFolder = activeSpace.folders.find((candidate) => candidate.id === target.id);
          if (!targetFolder) return;
          parentId = targetFolder.parentId;
          const siblings = activeSpace.folders.filter((candidate) => candidate.parentId === parentId && candidate.id !== folder.id);
          const targetIndex = siblings.findIndex((candidate) => candidate.id === targetFolder.id);
          position = targetIndex + (target.edge === "after" ? 1 : 0);
        }
        const response = await request(`/api/folders/${folder.id}`, "PATCH", { parentId, position });
        if (!response.ok) setNotice(response.error);
        else router.refresh();
      }
    } finally {
      setBusy(false);
      setDragItem(null);
      setDropTarget(null);
    }
  }

  function startDrag(event: DragEvent, item: DragItem) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${item.kind}:${item.id}`);
    setDragItem(item);
  }

  const spacePicker = (
    <SpacePicker
      spaces={spaces}
      activeSpace={activeSpace}
      open={spacePickerOpen}
      busy={busy}
      onOpen={() => setSpacePickerOpen(true)}
      onClose={() => setSpacePickerOpen(false)}
      onSelect={(spaceId) => {
        const space = spaces.find((candidate) => candidate.id === spaceId);
        if (space) selectSpace(space);
      }}
      onCreate={createSpace}
    />
  );

  return (
    <main className={`workspace ${sidebar ? "" : "sidebar-closed"}`}>
      <aside className="sidebar">
        <div className="sidebar-top workspace-top">
          <div className="space-switcher-wrap">
            <SidebarSpaceIdentity space={activeSpace} onOpen={() => setSpacePickerOpen(true)} />
          </div>
          <button
            className="icon-button"
            onClick={() => setSidebar(false)}
            title={text("Close navigation", "Navigation schließen")}
            aria-label={text("Close navigation", "Navigation schließen")}
          >
            <PanelLeftClose size={19} />
          </button>
        </div>

        {activeSpace && (
          <>
            <div className="space-toolbar">
              <span>{spaceRoleLabel(activeSpace.role, preferences.language)}</span>
              {(activeSpace.role === "OWNER" || user.role === "ADMIN") && (
                <button
                  className="space-manage-button"
                  onClick={() => setPermissionsOpen(true)}
                  title={text("Manage space", "Bereich verwalten")}
                  aria-label={text("Manage space", "Bereich verwalten")}
                >
                  <Settings2 size={14} />
                  <span>{text("Manage", "Verwalten")}</span>
                </button>
              )}
            </div>
            <div className="search-box">
              <Search size={16} />
              <input
                value={pageQuery}
                onChange={(event) => setPageQuery(event.target.value)}
                placeholder={text("Search this space…", "In diesem Bereich suchen…")}
                aria-label={text("Search this space", "Diesen Bereich durchsuchen")}
              />
            </div>
            <nav className="page-tree">
              {canWrite && (
                <div className="tree-actions">
                  <button disabled={busy} onClick={() => createPage(activeSpace.id)} title={text("New file (Ctrl+Shift+N)", "Neue Datei (Strg+Umschalt+N)")} aria-keyshortcuts="Control+Shift+N Meta+Shift+N"><FilePlus2 size={15} /> {text("File", "Datei")}</button>
                  <button disabled={busy} onClick={() => createFolder(activeSpace.id)}><FolderPlus size={15} /> {text("Folder", "Ordner")}</button>
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
                onDeletePage={deletePage}
                dragItem={dragItem}
                dropTarget={dropTarget}
                onDragStart={startDrag}
                onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
                onDropTarget={(target) => void dropTreeItem(target)}
                onDropTargetChange={setDropTarget}
              />
              <RootPages
                pages={activeSpace.pages.filter((page) => !page.folderId)}
                query={pageQuery}
                selectedPageId={selectedPage?.id || null}
                canWrite={Boolean(canWrite)}
                onMovePage={movePage}
                onDeletePage={deletePage}
                dragItem={dragItem}
                dropTarget={dropTarget}
                onDragStart={startDrag}
                onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
                onDropTarget={(target) => void dropTreeItem(target)}
                onDropTargetChange={setDropTarget}
              />
              {dragItem && (
                <div
                  className={`root-drop-zone ${dropTarget?.kind === "root" ? "active" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTarget({ kind: "root" });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    void dropTreeItem({ kind: "root" });
                  }}
                >
                  {text("Move to top level", "Auf oberste Ebene verschieben")}
                </div>
              )}
              {!activeSpace.pages.length && !activeSpace.folders.length && (
                <div className="tree-empty"><Folder size={20} /><span>{text("No content yet", "Noch keine Inhalte")}</span></div>
              )}
            </nav>
          </>
        )}

        <div className="sidebar-footer">
          {user.role === "ADMIN" && <Link className="footer-link" href="/admin/users"><ShieldCheck size={17} /> {text("User management", "Benutzerverwaltung")}</Link>}
          {user.role === "ADMIN" && <Link className="footer-link" href="/admin/teams"><Users size={17} /> {text("Team management", "Teamverwaltung")}</Link>}
          <button className="footer-link" onClick={() => signOut({ callbackUrl: "/signin" })}><LogOut size={17} /> {text("Sign out", "Abmelden")}</button>
          <button className="user-chip user-chip-button" onClick={() => setProfileOpen(true)}>
            <span>{user.hasAvatar ? <img src={`/api/users/${user.id}/avatar?v=${user.avatarVersion}`} alt="" /> : initials(user.name)}</span>
            <div><strong>{user.name}</strong><small>{user.email}</small></div>
          </button>
        </div>
      </aside>
      <section className="content">
        {!sidebar && (
          <button
            className="open-sidebar icon-button"
            onClick={() => setSidebar(true)}
            title={text("Open navigation", "Navigation öffnen")}
            aria-label={text("Open navigation", "Navigation öffnen")}
          >
            <PanelLeftOpen size={20} />
          </button>
        )}
        {selectedPage ? (
          <CollaborativeEditor
            key={selectedPage.id}
            page={selectedPage}
            user={user}
            headerCenter={spacePicker}
            canManageShares={user.role === "ADMIN" || activeSpace?.role === "OWNER"}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateRows: "70px minmax(0, 1fr)", height: "100%" }}>
            <header style={{ alignItems: "center", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "center", padding: "0 28px" }}>
              {spacePicker}
            </header>
            <div className="empty-state">
              <span>{activeSpace ? <Folder size={28} /> : <BookOpen size={28} />}</span>
              <h1>{activeSpace ? activeSpace.name : text("Your knowledge space is ready.", "Dein Wissensbereich ist bereit.")}</h1>
              <p>{activeSpace ? text("Create a file or folder.", "Lege eine Datei oder einen Ordner an.") : text("Create your first space.", "Lege deinen ersten Bereich an.")}</p>
              {activeSpace && canWrite ? (
                <button className="button primary-button compact" onClick={() => createPage(activeSpace.id)}><Plus size={17} /> {text("First file", "Erste Datei")}</button>
              ) : !activeSpace ? (
                <button className="button primary-button compact" onClick={createSpace}><Plus size={17} /> {text("Create space", "Bereich anlegen")}</button>
              ) : null}
            </div>
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
          onDeleted={() => {
            setPermissionsOpen(false);
            router.replace("/");
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
  onDeletePage,
  dragItem,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onDropTargetChange,
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
  onDeletePage: (page: PageItem) => void;
  dragItem: DragItem | null;
  dropTarget: DropTarget | null;
  onDragStart: (event: DragEvent, item: DragItem) => void;
  onDragEnd: () => void;
  onDropTarget: (target: DropTarget) => void;
  onDropTargetChange: (target: DropTarget) => void;
}) {
  const { text } = usePreferences();
  const folders = space.folders.filter((folder) => folder.parentId === parentId);
  return (
    <>
      {folders.map((folder) => {
        if (query && !folderMatches(folder.id, space, query)) return null;
        const isOpen = expanded.has(folder.id) || Boolean(query);
        const pages = space.pages.filter((page) => page.folderId === folder.id);
        const folderTarget = dropTarget?.kind === "folder" && dropTarget.id === folder.id ? dropTarget : null;
        return (
          <div className="folder-node" key={folder.id}>
            <div
              className={`folder-row ${folderTarget ? `drop-${folderTarget.edge}` : ""}`}
              onDragOver={(event) => {
                if (!dragItem || (dragItem.kind === "folder" && dragItem.id === folder.id)) return;
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                const edge = dragItem.kind === "page" ? "inside" : verticalDropEdge(event, true);
                onDropTargetChange({ kind: "folder", id: folder.id, edge });
              }}
              onDrop={(event) => {
                if (!dragItem || (dragItem.kind === "folder" && dragItem.id === folder.id)) return;
                event.preventDefault();
                event.stopPropagation();
                onDropTarget(folderTarget || { kind: "folder", id: folder.id, edge: "inside" });
              }}
            >
              {canWrite && !query && (
                <span
                  className="drag-handle"
                  draggable
                  onDragStart={(event) => onDragStart(event, { kind: "folder", id: folder.id })}
                  onDragEnd={onDragEnd}
                  title={text("Move folder", "Ordner verschieben")}
                >
                  <GripVertical size={13} />
                </span>
              )}
              <button className="folder-toggle" onClick={() => onToggle(folder.id)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {isOpen ? <Folder size={15} /> : <Folder size={15} />}
                <span>{folder.name}</span>
              </button>
              {canWrite && (
                <div className="node-actions">
                  <button disabled={busy} onClick={() => onCreatePage(space.id, folder.id)} title={text("File in folder", "Datei im Ordner")} aria-label={text(`Create file in ${folder.name}`, `Datei in ${folder.name} anlegen`)}><FilePlus2 size={14} /></button>
                  <button disabled={busy} onClick={() => onCreateFolder(space.id, folder.id)} title={text("Subfolder", "Unterordner")} aria-label={text(`Create subfolder in ${folder.name}`, `Unterordner in ${folder.name} anlegen`)}><FolderPlus size={14} /></button>
                  <button disabled={busy} onClick={() => onRenameFolder(folder)} title={text("Rename", "Umbenennen")} aria-label={text(`Rename ${folder.name}`, `${folder.name} umbenennen`)}><Pencil size={13} /></button>
                  <button disabled={busy} onClick={() => onDeleteFolder(folder)} title={text("Delete", "Löschen")} aria-label={text(`Delete ${folder.name}`, `${folder.name} löschen`)}><Trash2 size={13} /></button>
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
                  onDeletePage={onDeletePage}
                  dragItem={dragItem}
                  dropTarget={dropTarget}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTarget={onDropTarget}
                  onDropTargetChange={onDropTargetChange}
                />
                <RootPages
                  pages={pages}
                  query={query}
                  selectedPageId={selectedPageId}
                  canWrite={canWrite}
                  onMovePage={onMovePage}
                  onDeletePage={onDeletePage}
                  dragItem={dragItem}
                  dropTarget={dropTarget}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDropTarget={onDropTarget}
                  onDropTargetChange={onDropTargetChange}
                />
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
  onDeletePage,
  dragItem,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onDropTargetChange,
}: {
  pages: PageItem[];
  query: string;
  selectedPageId: string | null;
  canWrite: boolean;
  onMovePage: (page: PageItem) => void;
  onDeletePage: (page: PageItem) => void;
  dragItem: DragItem | null;
  dropTarget: DropTarget | null;
  onDragStart: (event: DragEvent, item: DragItem) => void;
  onDragEnd: () => void;
  onDropTarget: (target: DropTarget) => void;
  onDropTargetChange: (target: DropTarget) => void;
}) {
  const { text } = usePreferences();
  const needle = query.trim().toLowerCase();
  return (
    <>
      {pages.filter((page) => !needle || page.title.toLowerCase().includes(needle)).map((page) => {
        const pageTarget = dropTarget?.kind === "page" && dropTarget.id === page.id ? dropTarget : null;
        return (
        <div
          className={`page-row ${selectedPageId === page.id ? "active" : ""} ${pageTarget ? `drop-${pageTarget.edge}` : ""}`}
          key={page.id}
          onDragOver={(event) => {
            if (dragItem?.kind !== "page" || dragItem.id === page.id) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            onDropTargetChange({ kind: "page", id: page.id, edge: verticalDropEdge(event, false) });
          }}
          onDrop={(event) => {
            if (dragItem?.kind !== "page" || dragItem.id === page.id) return;
            event.preventDefault();
            event.stopPropagation();
            onDropTarget(pageTarget || { kind: "page", id: page.id, edge: "before" });
          }}
        >
          {canWrite && !query && (
            <span
              className="drag-handle"
              draggable
              onDragStart={(event) => onDragStart(event, { kind: "page", id: page.id })}
              onDragEnd={onDragEnd}
              title={text("Move page", "Seite verschieben")}
            >
              <GripVertical size={13} />
            </span>
          )}
          <Link className="page-link" href={`/?space=${page.spaceId}&page=${page.id}`}>
            {page.format === "CANVAS" ? <Network size={14} /> : page.format === "LATEX" ? <FileCode2 size={14} /> : <FileText size={14} />}<span>{page.title}</span>
          </Link>
          {canWrite && <button onClick={() => onMovePage(page)} title={text("Move file", "Datei verschieben")} aria-label={text(`Move ${page.title}`, `${page.title} verschieben`)}><MoreHorizontal size={15} /></button>}
          {canWrite && <button onClick={() => onDeletePage(page)} title={text("Delete file", "Datei löschen")} aria-label={text(`Delete ${page.title}`, `${page.title} löschen`)}><Trash2 size={14} /></button>}
        </div>
      )})}
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

function verticalDropEdge(event: DragEvent, allowInside: true): "before" | "inside" | "after";
function verticalDropEdge(event: DragEvent, allowInside: false): "before" | "after";
function verticalDropEdge(event: DragEvent, allowInside: boolean) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / bounds.height;
  if (ratio < (allowInside ? 0.25 : 0.5)) return "before";
  if (allowInside && ratio <= 0.75) return "inside";
  return "after";
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
  const { text } = usePreferences();
  const [value, setValue] = useState(dialog.kind === "text" || dialog.kind === "page" ? dialog.initial : dialog.kind === "move" ? dialog.currentFolderId || "" : "");
  const [format, setFormat] = useState<PageFormat>("MARKDOWN");
  useDialogEscape(onClose, busy);
  async function submit() {
    if (busy) return;
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
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="action-dialog" role="dialog" aria-modal="true" aria-label={dialog.title}>
        <header className="dialog-header">
          <div><span className="dialog-kicker">Atlas</span><h2>{dialog.title}</h2></div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label={text("Close", "Schließen")}><X size={18} /></button>
        </header>
        <div className="action-dialog-body">
          {(dialog.kind === "text" || dialog.kind === "page") && <label>{dialog.label}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && value.trim() && void submit()} /></label>}
          {dialog.kind === "page" && (
            <div className="format-picker">
              <button className={format === "MARKDOWN" ? "active" : ""} onClick={() => setFormat("MARKDOWN")}><FileText size={20} /><span><strong>Markdown</strong><small>{text("Flexible documentation with preview", "Flexible Dokumentation mit Vorschau")}</small></span></button>
              <button className={format === "LATEX" ? "active" : ""} onClick={() => setFormat("LATEX")}><FileCode2 size={20} /><span><strong>LaTeX</strong><small>{text("Scientific documents and formulas", "Wissenschaftliche Dokumente und Formeln")}</small></span></button>
              <button className={format === "CANVAS" ? "active" : ""} onClick={() => setFormat("CANVAS")}><Network size={20} /><span><strong>Canvas</strong><small>{text("Visual workspace with Excalidraw", "Visueller Arbeitsbereich mit Excalidraw")}</small></span></button>
            </div>
          )}
          {dialog.kind === "confirm" && <p>{dialog.message}</p>}
          {dialog.kind === "move" && (
            <label>{text("Destination folder", "Zielordner")}
              <select value={value} onChange={(event) => setValue(event.target.value)}>
                <option value="">{text("Top level", "Oberste Ebene")}</option>
                {dialog.folders.map(({ folder, depth }) => <option value={folder.id} key={folder.id}>{"— ".repeat(depth)}{folder.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <footer className="dialog-footer">
          <span />
          <div>
            <button className="button secondary-button compact" disabled={busy} onClick={onClose}>{text("Cancel", "Abbrechen")}</button>
            <button className={`button compact ${dialog.kind === "confirm" ? "danger-button" : "primary-button"}`} disabled={busy || ((dialog.kind === "text" || dialog.kind === "page") && !value.trim())} onClick={() => void submit()}>
              {busy ? text("Please wait…", "Bitte warten…") : dialog.kind === "confirm" ? text("Delete", "Löschen") : text("Save", "Speichern")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

async function jsonRequest<T extends { id: string }>(
  url: string,
  method: string,
  body: unknown,
  text: (english: string, german: string) => string,
): Promise<
  { ok: true; data: T } | { ok: false; error: string }
> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return response.ok
    ? { ok: true, data }
    : {
        ok: false,
        error: apiErrorMessage(data, text, {
          en: "The action could not be completed.",
          de: "Die Aktion konnte nicht abgeschlossen werden.",
        }),
      };
}
