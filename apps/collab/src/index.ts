import { PrismaClient } from "@prisma/client";
import { Database } from "@hocuspocus/extension-database";
import { Redis } from "@hocuspocus/extension-redis";
import { Server } from "@hocuspocus/server";
import { verifyCollaborationToken } from "./auth.js";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.COLLAB_SECRET;
const redisUrl = new URL(process.env.REDIS_URL || "redis://redis:6379");

if (!databaseUrl || !secret || secret.length < 32) {
  throw new Error("DATABASE_URL and COLLAB_SECRET (at least 32 characters) are required.");
}

const prisma = new PrismaClient();
const server = new Server({
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
        await prisma.collabDocument.upsert({
          where: { name: documentName },
          update: { data: Buffer.from(state) },
          create: { name: documentName, data: Buffer.from(state) },
        });
      },
    }),
  ],
  async onAuthenticate({ token, documentName, connectionConfig }) {
    const claims = await verifyCollaborationToken(token, secret, documentName);
    connectionConfig.readOnly = claims.readOnly;
    return { user: { id: claims.sub, name: claims.name } };
  },
  onRequest({ request, response }) {
    return new Promise<void>((resolve, reject) => {
      if (request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "ok" }));
        reject();
        return;
      }
      resolve();
    });
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
