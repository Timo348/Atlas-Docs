import "server-only";

import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { canManagePageShares, pageShareIsActive } from "@/lib/page-share";
import { spaceAccess } from "@/lib/access";

export async function pageShareManagementPage(user: Pick<User, "id" | "role">, pageId: string) {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: { id: true, title: true, spaceId: true },
  });
  if (!page) return { allowed: false, page: null };
  const role = await spaceAccess(user.id, page.spaceId);
  return { allowed: canManagePageShares(user.role, role), page };
}

export function pageShareResponse<T extends {
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>(share: T) {
  return {
    ...share,
    active: pageShareIsActive(share),
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
  };
}
