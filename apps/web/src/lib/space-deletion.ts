export function confirmsSpaceDeletion(confirmation: string, spaceName: string) {
  return confirmation === spaceName;
}

export function collaborationDocumentsForPages(pageIds: string[]) {
  return pageIds.map((pageId) => `page:${pageId}`);
}
