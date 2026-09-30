import type { Prisma } from "@prisma/client";

export type AccessDatabase = Pick<Prisma.TransactionClient, "user" | "page" | "membership" | "spaceTeamAccess">;
export type CurrentRole = "OWNER" | "EDITOR" | "VIEWER";

/** Tokens identify the user; live database rights authorize each synchronization. */
export async function currentPageRole(database: AccessDatabase, userId: string, pageId: string, now = new Date()) {
  const [user, page] = await Promise.all([
    database.user.findFirst({ where: { id: userId, active: true }, select: { id: true } }),
    database.page.findUnique({ where: { id: pageId }, select: { spaceId: true } }),
  ]);
  if (!user || !page) return null;
  const [direct, teams] = await Promise.all([
    database.membership.findUnique({ where: { userId_spaceId: { userId, spaceId: page.spaceId } }, select: { role: true } }),
    database.spaceTeamAccess.findMany({
      where: {
        spaceId: page.spaceId,
        team: { members: { some: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
      },
      select: { role: true },
    }),
  ]);
  const roles = [direct?.role, ...teams.map((team) => team.role)];
  return (["OWNER", "EDITOR", "VIEWER"] as const).find((role) => roles.includes(role)) ?? null;
}

export function writableRole(role: CurrentRole | null) {
  return role === "OWNER" || role === "EDITOR";
}
