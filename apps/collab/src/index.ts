import { PrismaClient } from "@prisma/client";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { Server } from "@hocuspocus/server";
import { verifyCollaborationToken } from "./auth.js";
import { pageIdFromDocumentName } from "./document-name.js";
import { flushCollaborationDocuments, isAuthorizedFlush } from "./flush.js";
import { replaceTodoIndex } from "@atlas/todo/persistence";
import { currentPageRole, writableRole } from "./access.js";
import { previewTodoSync } from "./todo-sync.js";
import { mergeTodoBoardStates } from "@atlas/todo";
import * as Y from "yjs";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.COLLAB_SECRET;
const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");

if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error("DATABASE_URL and COLLAB_SECRET (at least 32 characters) are required.");
}

const prisma = new PrismaClient();
type PublicShareContext = {
  kind: "page" | "folder";
  id: string;
  pageId: string;
  permission: "VIEW" | "EDIT";
};
type CollaborationContext = {
  user?: { id: string; name: string };
  publicShare?: PublicShareContext;
  tokenReadOnly?: boolean;
};

const PAGE_SHARE_REVALIDATE_MS = 60_000;

const server = new Server<CollaborationContext>({
  name: process.env.HOSTNAME || `atlas-${crypto.randomUUID()}`,
  port: Number(process.env.PORT || 1234),
  debounce: 2000,
  maxDebounce: 10000,
  quiet: true,
  extensions: [
    new Redis({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      options: { password: redisUrl.password || undefined },
    }),
    new Database({
      fetch: async ({ documentName }) => {
        const document = await prisma.collabDocument.findUnique({
          where: { name: documentName },
          select: { data: true },
        });
        return document ? new Uint8Array(document.data) : null;
      },
      store: async ({ documentName, state }) => {
        const pageId = pageIdFromDocumentName(documentName);
        if (!pageId) return;
        await prisma.$transaction(async (transaction) => {
          const pages = await transaction.$queryRaw<{ id: string; spaceId: string; format: string }[]>`
            SELECT "id", "spaceId", "format" FROM "Page" WHERE "id" = ${pageId} FOR UPDATE
          `;
          if (pages.length === 0) return;
          let durableState: Uint8Array = state;
          if (pages[0].format === "TODO") {
            const current = await transaction.$queryRaw<{ data: Uint8Array }[]>`
              SELECT "data" FROM "CollabDocument" WHERE "name" = ${documentName} FOR UPDATE
            `;
            durableState = mergeTodoBoardStates(current[0]?.data, state);
          }
          await transaction.collabDocument.upsert({
            where: { name: documentName },
            update: { data: Buffer.from(durableState) },
            create: { name: documentName, data: Buffer.from(durableState) },
          });
          if (pages[0].format === "TODO") await replaceTodoIndex(transaction, pages[0], durableState);
        });
      },
    }),
  ],
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const claims = await verifyCollaborationToken(token, secret, documentName);
    if (claims.shareId || claims.folderShareId) {
      const kind = claims.folderShareId ? "folder" : "page";
      const id = claims.folderShareId ?? claims.shareId!;
      const permission = kind === "folder"
        ? await activeFolderSharePermission(id, claims.pageId)
        : await activePageSharePermission(id, claims.pageId);
      if (!permission) throw new Error("Public share is no longer active.");
      connectionConfig.readOnly = claims.readOnly || permission !== "EDIT";
      return {
        user: { id: claims.sub, name: claims.name },
        publicShare: { kind, id, pageId: claims.pageId, permission },
        tokenReadOnly: claims.readOnly,
      };
    } else {
      const role = await currentPageRole(prisma, claims.sub, claims.pageId);
      if (!role) throw new Error("Page access is no longer active.");
      connectionConfig.readOnly = claims.readOnly || !writableRole(role);
    }
    return { user: { id: claims.sub, name: claims.name }, tokenReadOnly: claims.readOnly };
  },
  async beforeSync({ context, documentName, connection, type, document, payload }) {
    const pageId = pageIdFromDocumentName(documentName);
    if (!pageId) throw new Error("Invalid page document.");
    if (context.publicShare) {
      const share = context.publicShare;
      const permission = share.kind === "folder"
        ? await activeFolderSharePermission(share.id, pageId)
        : await activePageSharePermission(share.id, pageId);
      if (!permission) throw new Error("Public share is no longer active.");
      connection.readOnly = context.tokenReadOnly === true || permission !== "EDIT";
    } else {
      if (!context.user) throw new Error("User is not authenticated.");
      const role = await currentPageRole(prisma, context.user.id, pageId);
      if (!role) throw new Error("Page access is no longer active.");
      connection.readOnly = context.tokenReadOnly === true || !writableRole(role);
    }
    // Sync step 0 only requests state. Hocuspocus rejects updates when readOnly.
    if ((type !== 1 && type !== 2) || connection.readOnly) return;
    const page = await prisma.page.findUnique({ where: { id: pageId }, select: { format: true, spaceId: true } });
    if (page?.format !== "TODO") return;
    const { newlyAssigned } = previewTodoSync(document, payload);
    if (newlyAssigned.length) {
      const active = await prisma.user.findMany({
        where: {
          id: { in: newlyAssigned }, active: true,
          OR: [
            { memberships: { some: { spaceId: page.spaceId } } },
            { teamMemberships: { some: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              team: { spaces: { some: { spaceId: page.spaceId } } },
            } } },
          ],
        },
        select: { id: true },
      });
      if (active.length !== newlyAssigned.length) throw new Error("A task assignee no longer has active Space access.");
    }
    // Another connection may have changed dependencies while the database query
    // awaited. Validate and apply synchronously; Hocuspocus' subsequent apply is
    // idempotent and uses this same origin for broadcasting and persistence.
    previewTodoSync(document, payload);
    Y.applyUpdate(document, payload, { source: "connection", connection });
  },
  async connected({ context, connection }) {
    const publicShare = context.publicShare;
    if (!publicShare) return;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const permission = publicShare.kind === "folder"
          ? await activeFolderSharePermission(publicShare.id, publicShare.pageId)
          : await activePageSharePermission(publicShare.id, publicShare.pageId);
        if (!permission || permission !== publicShare.permission) connection.close();
      } catch (error) {
        console.error("[atlas-collab] Page-share revalidation failed closed.", error);
        connection.close();
      } finally {
        checking = false;
      }
    }, PAGE_SHARE_REVALIDATE_MS);
    timer.unref();
    connection.onClose(() => clearInterval(timer));
  },
  async onRequest({ request, response, instance }) {
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return Promise.reject();
    }
    if (request.url === "/internal/flush") {
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" });
        response.end();
        return Promise.reject();
      }
      if (!isAuthorizedFlush(request.headers.authorization, secret)) {
        response.writeHead(401, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unauthorized" }));
        return Promise.reject();
      }
      try {
        const flushedDocuments = await flushCollaborationDocuments(instance);
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ flushedDocuments }));
      } catch (error) {
        console.error("[atlas-collab] Collaboration flush failed.", error);
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Flush failed" }));
      }
      return Promise.reject();
    }
  },
});

await server.listen();

async function activePageSharePermission(id: string, pageId: string) {
  const share = await prisma.pageShare.findFirst({
    where: {
      id,
      pageId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { permission: true },
  });
  return share?.permission ?? null;
}

async function activeFolderSharePermission(id: string, pageId: string) {
  const share = await prisma.folderShare.findFirst({
    where: {
      id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { folderId: true, permission: true },
  });
  if (!share) return null;
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { folderId: true } });
  if (!page?.folderId) return null;
  let currentId: string | null = page.folderId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    if (currentId === share.folderId) return share.permission;
    visited.add(currentId);
    const folder: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = folder?.parentId ?? null;
  }
  return null;
}

async function shutdown() {
  await server.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
