type NavigablePage = {
  id: string;
  folderId: string | null;
};

export function pageAfterDeletion<T extends NavigablePage>(pages: T[], deletedPageId: string): T | null {
  const deleted = pages.find((page) => page.id === deletedPageId);
  if (!deleted) return pages[0] || null;

  const siblings = pages.filter((page) => page.folderId === deleted.folderId);
  const siblingIndex = siblings.findIndex((page) => page.id === deletedPageId);
  const remainingSiblings = siblings.filter((page) => page.id !== deletedPageId);
  return remainingSiblings[siblingIndex]
    || remainingSiblings[siblingIndex - 1]
    || pages.find((page) => page.id !== deletedPageId)
    || null;
}
