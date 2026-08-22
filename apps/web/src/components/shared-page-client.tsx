"use client";

import Link from "next/link";
import { BookOpen, Eye, Pencil } from "lucide-react";
import { CollaborativeEditor } from "@/components/collaborative-editor";
import { usePreferences } from "@/components/preferences-provider";

export function SharedPageClient({
  page,
  token,
  permission,
  shareId,
}: {
  page: {
    id: string;
    title: string;
    slug: string;
    parentId: null;
    format: "MARKDOWN" | "LATEX" | "CANVAS" | "MERMAID" | "GANTT" | "TODO" | "TEXT" | "FILE";
    fileMime?: string | null;
    fileSize?: number | null;
  };
  token: string;
  permission: "VIEW" | "EDIT";
  shareId: string;
}) {
  const { text } = usePreferences();
  const editing = permission === "EDIT";
  const accessBadge = (
    <span className={`shared-access-badge ${editing ? "editing" : "viewing"}`}>
      {editing ? <Pencil size={13} /> : <Eye size={13} />}
      {editing ? text("Shared editing link", "Geteilter Bearbeitungslink") : text("Shared read-only link", "Geteilter Nur-Lesen-Link")}
    </span>
  );
  return (
    <main className="shared-page-frame">
      <header className="shared-page-brandbar">
        <Link href="/" className="shared-page-brand"><span><BookOpen size={18} /></span><strong>Atlas Docs</strong></Link>
        <p>{text(
          editing ? "This link may edit this page's content only." : "This link may view this page only.",
          editing ? "Dieser Link darf nur den Inhalt dieser Seite bearbeiten." : "Dieser Link darf nur diese Seite ansehen.",
        )}</p>
        <Link href="/signin" className="button compact secondary-button">{text("Sign in", "Anmelden")}</Link>
      </header>
      <CollaborativeEditor
        page={page}
        user={{
          id: `share:${shareId}`,
          name: editing ? text("Shared editor", "Geteilter Bearbeiter") : text("Shared viewer", "Geteilter Betrachter"),
          email: "",
          role: "MEMBER",
          hasAvatar: false,
          avatarVersion: 0,
        }}
        headerCenter={accessBadge}
        publicShare={{ token, permission }}
      />
    </main>
  );
}
