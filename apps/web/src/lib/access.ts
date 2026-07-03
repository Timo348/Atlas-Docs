import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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
  return db.page.findFirst({
    where: {
      id: pageId,
      space: { memberships: { some: { userId } } },
    },
    include: {
      space: {
        include: { memberships: { where: { userId }, select: { role: true } } },
      },
    },
  });
}

export function canEdit(role: string) {
  return role === "OWNER" || role === "EDITOR";
}
