import { pageShareIsActive } from "@/lib/page-share";

export function folderScopeIds(
  folders: ReadonlyArray<{ id: string; parentId: string | null }>,
  rootId: string,
) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        changed = true;
      }
    }
  }
  return result;
}
export function folderShareIsActive(
  share: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
) {
  return pageShareIsActive(share, now);
}
