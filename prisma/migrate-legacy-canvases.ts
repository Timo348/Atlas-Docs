import { PrismaClient, type Prisma } from "@prisma/client";
import {
  CANVAS_MIGRATION_VERSION,
  CanvasStateDecodeError,
  extractCanvasState,
} from "./canvas-migration-state";

const prisma = new PrismaClient();
const CANVAS_TITLE_SUFFIX = " – Canvas";
const TRANSACTION_TIMEOUT_MS = positiveInteger(
  process.env.ATLAS_CANVAS_MIGRATION_TIMEOUT_MS,
  10 * 60 * 1_000,
);

type LockedPage = {
  id: string;
  title: string;
  slug: string;
  spaceId: string;
  parentId: string | null;
  folderId: string | null;
  format: "MARKDOWN" | "LATEX" | "CANVAS";
  sortOrder: number;
  versionCounter: number;
  createdById: string;
  legacyCanvasMigrationVersion: number;
};

async function main() {
  const candidates = await prisma.page.findMany({
    where: {
      format: { not: "CANVAS" },
      legacyCanvasMigrationVersion: { lt: CANVAS_MIGRATION_VERSION },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  let migrated = 0;
  let checked = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await migratePage(candidate.id);
      if (result === "migrated") migrated += 1;
      if (result !== "already-checked") checked += 1;
    } catch (error) {
      if (!(error instanceof CanvasStateDecodeError)) throw error;
      failed += 1;
      console.error(
        `[atlas-migrate] Page ${candidate.id} was left unchanged because its Yjs data could not be migrated.`,
        error,
      );
    }
  }

  console.log(
    `[atlas-migrate] Legacy canvas scan complete: ${checked} checked, ${migrated} canvas files created, ${failed} left for recovery.`,
  );
  if (failed > 0) {
    console.warn(
      "[atlas-migrate] Unreadable source data was preserved and remains unmarked; review the page IDs above before removing legacy data.",
    );
  }
}

async function migratePage(pageId: string) {
  return prisma.$transaction(async (transaction) => {
    const pages = await transaction.$queryRaw<LockedPage[]>`
      SELECT
        "id", "title", "slug", "spaceId", "parentId", "folderId", "format",
        "sortOrder", "versionCounter", "createdById", "legacyCanvasMigrationVersion"
      FROM "Page"
      WHERE "id" = ${pageId}
      FOR UPDATE
    `;
    const page = pages[0];
    if (
      !page
      || page.format === "CANVAS"
      || page.legacyCanvasMigrationVersion >= CANVAS_MIGRATION_VERSION
    ) return "already-checked" as const;

    const documents = await transaction.$queryRaw<{ data: Uint8Array }[]>`
      SELECT "data"
      FROM "CollabDocument"
      WHERE "name" = ${`page:${page.id}`}
      FOR UPDATE
    `;
    const currentCanvas = extractCanvasState(documents[0]?.data);
    const versions = await transaction.pageVersion.findMany({
      where: { pageId: page.id },
      orderBy: { version: "asc" },
      select: {
        version: true,
        title: true,
        data: true,
        restoredFromVersion: true,
        createdById: true,
        createdAt: true,
      },
    });
    const canvasVersions = versions.map((version) => ({
      ...version,
      canvas: extractCanvasState(version.data),
    }));
    const hasCanvas = currentCanvas.hasContent
      || canvasVersions.some((version) => version.canvas.hasContent);

    if (!hasCanvas) {
      await transaction.page.update({
        where: { id: page.id },
        data: { legacyCanvasMigrationVersion: CANVAS_MIGRATION_VERSION },
      });
      return "checked" as const;
    }

    const slug = await availableCanvasSlug(transaction, page.spaceId, page.slug);
    await transaction.page.updateMany({
      where: {
        spaceId: page.spaceId,
        folderId: page.folderId,
        sortOrder: { gt: page.sortOrder },
      },
      data: { sortOrder: { increment: 1 } },
    });

    const target = await transaction.page.create({
      data: {
        title: canvasTitle(page.title),
        slug,
        spaceId: page.spaceId,
        parentId: page.parentId,
        folderId: page.folderId,
        format: "CANVAS",
        sortOrder: page.sortOrder + 1,
        versionCounter: canvasVersions.reduce(
          (maximum, version) => Math.max(maximum, version.version),
          page.versionCounter,
        ),
        legacyCanvasMigrationVersion: CANVAS_MIGRATION_VERSION,
        createdById: page.createdById,
      },
      select: { id: true },
    });

    await transaction.collabDocument.create({
      data: {
        name: `page:${target.id}`,
        data: Buffer.from(currentCanvas.state),
      },
    });
    if (canvasVersions.length) {
      await transaction.pageVersion.createMany({
        data: canvasVersions.map((version) => ({
          pageId: target.id,
          version: version.version,
          title: canvasTitle(version.title),
          data: Buffer.from(version.canvas.state),
          restoredFromVersion: version.restoredFromVersion,
          createdById: version.createdById,
          createdAt: version.createdAt,
        })),
      });
    }
    await transaction.page.update({
      where: { id: page.id },
      data: {
        legacyCanvasMigrationVersion: CANVAS_MIGRATION_VERSION,
        legacyCanvasTargetId: target.id,
      },
    });
    return "migrated" as const;
  }, { maxWait: 30_000, timeout: TRANSACTION_TIMEOUT_MS });
}

async function availableCanvasSlug(
  transaction: Prisma.TransactionClient,
  spaceId: string,
  sourceSlug: string,
) {
  const base = `${sourceSlug}-canvas`;
  let candidate = base;
  let counter = 2;
  while (await transaction.page.findUnique({
    where: { spaceId_slug: { spaceId, slug: candidate } },
    select: { id: true },
  })) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function canvasTitle(sourceTitle: string) {
  return `${sourceTitle.slice(0, 160 - CANVAS_TITLE_SUFFIX.length)}${CANVAS_TITLE_SUFFIX}`;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

main()
  .catch((error) => {
    console.error("[atlas-migrate] Legacy canvas migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
