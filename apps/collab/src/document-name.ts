export function pageIdFromDocumentName(documentName: string) {
  return documentName.startsWith("page:") && documentName.length > "page:".length
    ? documentName.slice("page:".length)
    : null;
}
