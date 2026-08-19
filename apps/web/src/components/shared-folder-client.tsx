"use client";

import Link from "next/link";
import { BookOpen, Eye, FileCode2, FileText, Folder, Network, Pencil } from "lucide-react";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { PdfDocument } from "@/components/pdf-document";
import { usePreferences } from "@/components/preferences-provider";

type SharedFolder = { id: string; name: string; parentId: string | null; sortOrder: number };
type SharedPage = {
  id: string;
  title: string;
  slug: string;
  folderId: string | null;
  format: "MARKDOWN" | "LATEX" | "CANVAS" | "PDF";
  sortOrder: number;
};

export function SharedFolderClient({
  token,
  shareId,
  permission,
  rootFolderId,
  rootFolderName,
  folders,
  pages,
  selectedPage,
}: {
  token: string;
  shareId: string;
  permission: "VIEW" | "EDIT";
  rootFolderId: string;
  rootFolderName: string;
  folders: SharedFolder[];
  pages: SharedPage[];
  selectedPage: SharedPage | null;
}) {
  const { text } = usePreferences();
  const editing = permission === "EDIT";
  const publicShare = { kind: "folder" as const, token, permission };
  const accessBadge = (
    <span className={`shared-access-badge ${editing ? "editing" : "viewing"}`}>
      {editing ? <Pencil size={13} /> : <Eye size={13} />}
      {editing ? text("Shared folder editing", "Geteilte Ordnerbearbeitung") : text("Shared folder read-only", "Geteilter Ordner · Nur lesen")}
    </span>
  );

  return (
    <main className="shared-folder-frame">
      <header className="shared-page-brandbar">
        <Link href="/" className="shared-page-brand"><span><BookOpen size={18} /></span><strong>Atlas Docs</strong></Link>
        <p>{text(
          editing ? "This link may edit content inside the shared folder." : "This link may view the shared folder only.",
          editing ? "Dieser Link darf Inhalte im freigegebenen Ordner bearbeiten." : "Dieser Link darf den freigegebenen Ordner nur ansehen.",
        )}</p>
        <Link href="/signin" className="button compact secondary-button">{text("Sign in", "Anmelden")}</Link>
      </header>
      <div className="shared-folder-workspace">
        <aside className="shared-folder-sidebar">
          <div className="shared-folder-title"><Folder size={18} /><div><small>{text("Shared folder", "Freigegebener Ordner")}</small><strong>{rootFolderName}</strong></div></div>
          <nav aria-label={text("Shared files", "Freigegebene Dateien")}>
            <SharedFolderTree rootId={rootFolderId} token={token} folders={folders} pages={pages} selectedPageId={selectedPage?.id ?? null} />
          </nav>
        </aside>
        <section className="shared-folder-content">
          {selectedPage ? (
            selectedPage.format === "PDF"
              ? <PdfDocument key={selectedPage.id} page={selectedPage} headerCenter={accessBadge} publicShare={{ ...publicShare, permission: "VIEW" }} />
              : <CollaborativeEditor
                key={selectedPage.id}
                page={{ ...selectedPage, parentId: null, format: selectedPage.format }}
                user={{ id: `folder-share:${shareId}`, name: editing ? text("Shared folder editor", "Geteilter Ordner-Bearbeiter") : text("Shared folder viewer", "Geteilter Ordner-Betrachter"), email: "", role: "MEMBER", hasAvatar: false, avatarVersion: 0 }}
                headerCenter={accessBadge}
                publicShare={publicShare}
              />
          ) : (
            <div className="empty-state"><span><Folder size={28} /></span><h1>{rootFolderName}</h1><p>{text("This shared folder contains no files.", "Dieser freigegebene Ordner enthält keine Dateien.")}</p></div>
          )}
        </section>
      </div>
    </main>
  );
}

function SharedFolderTree({ rootId, token, folders, pages, selectedPageId }: {
  rootId: string;
  token: string;
  folders: SharedFolder[];
  pages: SharedPage[];
  selectedPageId: string | null;
}) {
  const folder = folders.find((candidate) => candidate.id === rootId);
  if (!folder) return null;
  const directPages = pages.filter((page) => page.folderId === rootId);
  const childFolders = folders.filter((candidate) => candidate.parentId === rootId);
  return (
    <div className="shared-folder-tree-node">
      {folder.parentId !== null && <div className="shared-folder-tree-label"><Folder size={14} /><span>{folder.name}</span></div>}
      <div className={folder.parentId === null ? "" : "shared-folder-tree-children"}>
        {directPages.map((page) => (
          <Link key={page.id} className={`shared-folder-page ${selectedPageId === page.id ? "active" : ""}`} href={`/share/folder/${encodeURIComponent(token)}?page=${encodeURIComponent(page.id)}`}>
            {page.format === "CANVAS" ? <Network size={14} /> : page.format === "LATEX" ? <FileCode2 size={14} /> : <FileText size={14} />}
            <span>{page.title}</span>
          </Link>
        ))}
        {childFolders.map((child) => <SharedFolderTree key={child.id} rootId={child.id} token={token} folders={folders} pages={pages} selectedPageId={selectedPageId} />)}
      </div>
    </div>
  );
}
