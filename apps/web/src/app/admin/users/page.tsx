import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { PreferencesProvider } from "@/components/preferences-provider";
import { UsersAdminPage } from "@/components/users-admin";
import { normalizePreferences } from "@/lib/preferences";

export default async function UsersPage() {
  const current = await requireUser();
  if (current.role !== "ADMIN") redirect("/");
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
    orderBy: { createdAt: "asc" },
  });
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

  return (
    <PreferencesProvider initial={preferences}>
      <UsersAdminPage
        initialUsers={users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }))}
        currentUserId={current.id}
      />
    </PreferencesProvider>
  );
}
