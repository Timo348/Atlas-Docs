import { timingSafeEqual } from "node:crypto";
import type { Hocuspocus } from "@hocuspocus/server";

export function isAuthorizedFlush(authorization: string | undefined, secret: string) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(secret, "utf8");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function flushCollaborationDocuments(instance: Hocuspocus) {
  const documents = Array.from(instance.documents.values());
  await Promise.all(documents.map((document) => instance.storeDocumentHooks(document, {
    clientsCount: document.getConnectionsCount(),
    document,
    documentName: document.name,
    instance,
    lastContext: undefined,
    lastTransactionOrigin: "backup-flush",
  }, true)));
  return documents.length;
}
