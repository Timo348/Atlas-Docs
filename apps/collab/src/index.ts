import { PrismaClient } from "@prisma/client";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { Server } from "@hocuspocus/server";
import { verifyCollaborationToken } from "./auth.js";
import { pageIdFromDocumentName } from "./document-name.js";
import { flushCollaborationDocuments, isAuthorizedFlush } from "./flush.js";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.COLLAB_SECRET;
const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");

if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error("DATABASE_URL and COLLAB_SECRET (at least 32 characters) are required.");
}

const prisma = new PrismaClient();
type CollaborationContext = {
  user?: { id: string; name: string };
  pageShare?: {
    id: string;
    pageId: string;
    permission: "VIEW" | "EDIT";
  };
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
          const pages = await transaction.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Page" WHERE "id" = ${pageId} FOR KEY SHARE
          `;
          if (pages.length === 0) return;
          await transaction.collabDocument.upsert({
            where: { name: documentName },
            update: { data: Buffer.from(state) },
            create: { name: documentName, data: Buffer.from(state) },
          });
        });
      },
    }),
  ],
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const claims = await verifyCollaborationToken(token, secret, documentName);
    if (claims.shareId) {
      const share = await prisma.pageShare.findFirst({
        where: {
          id: claims.shareId,
          pageId: claims.pageId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { permission: true },
      });
      if (!share) throw new Error("Page share is no longer active.");
      connectionConfig.readOnly = claims.readOnly || share.permission !== "EDIT";
      return {
        user: { id: claims.sub, name: claims.name },
        pageShare: { id: claims.shareId, pageId: claims.pageId, permission: share.permission },
      };
    } else {
      connectionConfig.readOnly = claims.readOnly;
    }
    return { user: { id: claims.sub, name: claims.name } };
  },
  async connected({ context, connection }) {
    const pageShare = context.pageShare;
    if (!pageShare) return;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const current = await prisma.pageShare.findFirst({
          where: {
            id: pageShare.id,
            pageId: pageShare.pageId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: { permission: true },
        });
        if (!current || current.permission !== pageShare.permission) connection.close();
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

async function shutdown() {
  await server.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
