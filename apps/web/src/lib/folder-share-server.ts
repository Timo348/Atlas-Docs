import "server-only";

import { db } from "@/lib/db";
import { folderScopeIds, folderShareIsActive } from "@/lib/folder-share";
import { pageShareTokenHash, validPageShareToken } from "@/lib/page-share";

export async function activeFolderShare(token: string, now = new Date()) {
  if (!validPageShareToken(token)) return null;
  const share = await db.folderShare.findUnique({
    where: { tokenHash: pageShareTokenHash(token) },
    include: {
      folder: { select: { id: true, name: true, spaceId: true } },
    },
  });
  return share && folderShareIsActive(share, now) ? share : null;
}
export async function folderShareContent(folderId: string) {
  const allFolders = await db.folder.findMany({
    where: { spaceId: (await db.folder.findUniqueOrThrow({ where: { id: folderId }, select: { spaceId: true } })).spaceId },
    select: { id: true, name: true, parentId: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const ids = folderScopeIds(allFolders, folderId);
  const folders = allFolders.filter((folder) => ids.has(folder.id));
  const pages = await db.page.findMany({
    where: { folderId: { in: [...ids] } },
    select: { id: true, title: true, slug: true, folderId: true, format: true, sortOrder: true, createdById: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return { folders, pages };
}

export async function activeFolderSharePage(token: string, pageId: string) {
  const share = await activeFolderShare(token);
  if (!share) return null;
  const content = await folderShareContent(share.folderId);
  const page = content.pages.find((candidate) => candidate.id === pageId);
  if (!page) return null;
  const creator = await db.user.findUnique({
    where: { id: page.createdById },
    select: { language: true },
  });
  return { share, page: { ...page, createdBy: creator ?? { language: "en" } } };
}
