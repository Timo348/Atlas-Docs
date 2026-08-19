import "server-only";

import type { User } from "@prisma/client";
import { spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { folderShareIsActive } from "@/lib/folder-share";
import { canManagePageShares } from "@/lib/page-share";

export async function folderShareManagementFolder(user: Pick<User, "id" | "role">, folderId: string) {
  const folder = await db.folder.findUnique({
    where: { id: folderId },
    select: { id: true, name: true, spaceId: true },
  });
  if (!folder) return { allowed: false, folder: null };
  const role = await spaceAccess(user.id, folder.spaceId);
  return { allowed: canManagePageShares(user.role, role), folder };
}
export function folderShareResponse<T extends {
  revokedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>(share: T) {
  return {
    ...share,
    active: folderShareIsActive(share),
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revokedAt: share.revokedAt?.toISOString() ?? null,
  };
}
