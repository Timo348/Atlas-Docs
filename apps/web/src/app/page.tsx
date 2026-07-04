import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { db } from "@/lib/db";
import { strongestSpaceRole } from "@/lib/space-role";
import { WorkspaceShell } from "@/components/workspace-shell";
import { PreferencesProvider } from "@/components/preferences-provider";
import { normalizePreferences } from "@/lib/preferences";

export default async function Home(props: { searchParams: Promise<{ page?: string; space?: string }> }) {
  const user = await requireUser();
  const now = new Date();
  const { page: requestedPage, space: requestedSpace } = await props.searchParams;
  const spaceRows = await db.space.findMany({
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
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageMime: true,
      updatedAt: true,
      memberships: { where: { userId: user.id }, select: { role: true } },
      teamAccess: {
        where: {
          team: {
            members: {
              some: {
                userId: user.id,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              },
            },
          },
        },
        select: { role: true },
      },
      folders: {
        select: { id: true, name: true, parentId: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      pages: {
        select: { id: true, title: true, parentId: true, folderId: true, spaceId: true, slug: true, format: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
  const spaces = spaceRows.map(({ memberships, teamAccess, ...space }) => ({
    ...space,
    hasImage: Boolean(space.imageMime),
    imageVersion: space.updatedAt.getTime(),
    role: strongestSpaceRole([
      memberships[0]?.role,
      ...teamAccess.map((grant) => grant.role),
    ])!,
  }));
  const pages = spaces.flatMap((space) => space.pages);
  const requested = pages.find((page) => page.id === requestedPage);
  const selectedSpace = spaces.find((space) => space.id === requested?.spaceId)
    || spaces.find((space) => space.id === requestedSpace)
    || spaces[0]
    || null;
  const selected = requested?.spaceId === selectedSpace?.id
    ? requested
    : selectedSpace?.pages[0] || null;
  if (requestedPage && !selected) redirect("/");

  const preferences = normalizePreferences({
    language: user.language,
    colorTheme: user.colorTheme,
    uiFont: user.uiFont,
    editorFont: user.editorFont,
    fontSize: user.fontSize,
    compactMode: user.compactMode,
  });

  return (
    <PreferencesProvider initial={preferences}>
      <WorkspaceShell
        spaces={spaces}
        selectedSpaceId={selectedSpace?.id || null}
        selectedPage={selected}
        user={{
          id: user.id,
          name: user.name || user.email,
          email: user.email,
          role: user.role,
          avatarVersion: user.updatedAt.getTime(),
          hasAvatar: Boolean(user.avatarMime),
        }}
      />
    </PreferencesProvider>
  );
}
