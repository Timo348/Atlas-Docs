import { requireUser } from "@/lib/access";
import { SettingsPage } from "@/components/settings-page";
import { PreferencesProvider } from "@/components/preferences-provider";
import { db } from "@/lib/db";
import { normalizePreferences } from "@/lib/preferences";

export default async function Settings() {
  const user = await requireUser();
  const now = new Date();
  const spaces = await db.space.findMany({
    where: {
      OR: [
        { memberships: { some: { userId: user.id } } },
        {
          teamAccess: {
            some: {
              team: {
                members: {
                  some: {
                    userId: user.id,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const preferences = normalizePreferences({
    language: user.language,
    colorTheme: user.colorTheme,
    uiFont: user.uiFont,
    editorFont: user.editorFont,
    fontSize: user.fontSize,
    defaultEditorView: user.defaultEditorView,
    fileViewDefaults: user.fileViewDefaults,
    defaultSpaceId: spaces.some((space) => space.id === user.defaultSpaceId) ? user.defaultSpaceId : null,
    compactMode: user.compactMode,
  });

  return (
    <PreferencesProvider initial={preferences}>
      <SettingsPage
        spaces={spaces}
        user={{
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          role: user.role,
          hasAvatar: Boolean(user.avatarMime),
          avatarVersion: user.updatedAt.getTime(),
          canChangePassword: Boolean(user.passwordHash),
        }}
      />
    </PreferencesProvider>
  );
}
