import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { strongestSpaceRole } from "@/lib/space-role";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.active) redirect("/signin");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.active) redirect("/signin");
  return user;
}

export async function requireApiUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.active) return null;
  return db.user.findFirst({ where: { id: session.user.id, active: true } });
}

export async function pageAccess(userId: string, pageId: string) {
  const page = await db.page.findUnique({
    where: { id: pageId },
  });
  if (!page) return null;
  const role = await spaceAccess(userId, page.spaceId);
  return role ? { ...page, accessRole: role } : null;
}

export async function spaceAccess(userId: string, spaceId: string) {
  const [direct, teamGrants] = await Promise.all([
    db.membership.findUnique({
      where: { userId_spaceId: { userId, spaceId } },
      select: { role: true },
    }),
    db.spaceTeamAccess.findMany({
      where: {
        spaceId,
        team: {
          members: {
            some: {
              userId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
        },
      },
      select: { role: true },
    }),
  ]);
  return strongestSpaceRole([direct?.role, ...teamGrants.map((grant) => grant.role)]);
}

export function canEdit(role: string | null) {
  return role === "OWNER" || role === "EDITOR";
}
