import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { TeamsAdmin } from "@/components/teams-admin";
import { PreferencesProvider } from "@/components/preferences-provider";
import { normalizePreferences } from "@/lib/preferences";

export default async function TeamsPage() {
  const current = await requireUser();
  if (current.role !== "ADMIN") redirect("/");
  const [users, teams] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    db.team.findMany({
      select: {
        id: true,
        name: true,
        members: { select: { userId: true, expiresAt: true } },
        spaces: { select: { role: true, space: { select: { id: true, name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  const preferences = normalizePreferences({
    language: current.language,
    colorTheme: current.colorTheme,
    uiFont: current.uiFont,
    editorFont: current.editorFont,
    fontSize: current.fontSize,
    defaultEditorView: current.defaultEditorView,
    defaultSpaceId: current.defaultSpaceId,
    compactMode: current.compactMode,
  });
  const text = (english: string, german: string) => preferences.language === "de" ? german : english;

  return (
    <PreferencesProvider initial={preferences}>
      <main className="admin-page teams-admin-page">
        <header className="admin-header">
          <div>
            <p className="eyebrow dark"><Users size={15} /> {text("Administration", "Administration")}</p>
            <h1>{text("Team management", "Teamverwaltung")}</h1>
          </div>
          <Link href="/" className="button secondary-button"><ArrowLeft size={16} /> {text("Back to workspace", "Zurück zum Workspace")}</Link>
        </header>
        <TeamsAdmin
          users={users}
          initialTeams={teams.map((team) => ({
            ...team,
            members: team.members.map((member) => ({
              ...member,
              expiresAt: member.expiresAt?.toISOString() || null,
            })),
          }))}
        />
      </main>
    </PreferencesProvider>
  );
}
