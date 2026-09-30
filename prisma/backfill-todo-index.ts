import { PrismaClient } from "@prisma/client";
import { TodoBoardDecodeError } from "@atlas/todo";
import { replaceTodoIndex } from "@atlas/todo/persistence";

const prisma = new PrismaClient();

async function main() {
  const pages = await prisma.page.findMany({
    where: { format: "TODO", todoIndexState: { not: "INDEXED" } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let indexed = 0;
  let damaged = 0;
  for (const candidate of pages) {
    const result = await prisma.$transaction(async (transaction) => {
      // The same lock order is used by Collab, so the scan cannot project stale state.
      const locked = await transaction.$queryRaw<{ id: string; spaceId: string; todoIndexState: string }[]>`
        SELECT "id", "spaceId", "todoIndexState" FROM "Page"
        WHERE "id" = ${candidate.id} AND "format" = 'TODO' FOR UPDATE
      `;
      const page = locked[0];
      if (!page || page.todoIndexState === "INDEXED") return "skipped";
      const documents = await transaction.$queryRaw<{ data: Uint8Array }[]>`
        SELECT "data" FROM "CollabDocument" WHERE "name" = ${`page:${page.id}`} FOR UPDATE
      `;
      try {
        await replaceTodoIndex(transaction, page, documents[0]?.data);
        return "indexed";
      } catch (error) {
        if (!(error instanceof TodoBoardDecodeError)) throw error;
        // Only diagnostic metadata changes; original Yjs bytes and any last good index survive.
        await transaction.page.update({
          where: { id: page.id },
          data: { todoIndexState: "ERROR", todoIndexError: error.message },
        });
        console.error(`[atlas-migrate] Todo board ${page.id} needs recovery: ${error.message}`);
        return "damaged";
      }
    }, { maxWait: 30_000, timeout: 60_000 });
    if (result === "indexed") indexed += 1;
    if (result === "damaged") damaged += 1;
  }
  console.log(`[atlas-migrate] Todo index scan: ${indexed} indexed, ${damaged} damaged boards preserved.`);
}

main().catch((error) => {
  console.error("[atlas-migrate] Todo index scan failed.", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
