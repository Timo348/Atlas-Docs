import type { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";
import {
  buildPortableLayout,
  canUseExportScope,
  decodeCollaborationDocument,
  imageExtension,
  rewriteImageReferences,
  type ExportScope,
  type PortableSpace,
} from "@/lib/portable-backup";
import { createZipStream, type ZipEntry } from "@/lib/zip-stream";
import { serializeTodoBoardState } from "@/lib/todo-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const scope = request.nextUrl.searchParams.get("scope");
  if (scope !== "accessible" && scope !== "instance") {
    return apiErrorResponse("INVALID_INPUT", 400);
  }
  if (!canUseExportScope(user.role, scope)) return apiErrorResponse("ACCESS_DENIED", 403);

  const warnings: string[] = [];
  try {
    await flushCurrentDocuments();
  } catch (error) {
    console.error("[atlas-export] Collaboration flush failed; exporting persisted state.", error);
    warnings.push("The collaboration service could not be flushed. This archive contains the latest state already persisted in PostgreSQL.");
  }

  const now = new Date();
  const spaces = await loadSpaces(user.id, scope, now);
  const layout = buildPortableLayout(spaces);
  const stream = createZipStream(createExportEntries(spaces, layout, scope, now, warnings), now);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="atlas-docs-export-${timestamp}.zip"`,
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function loadSpaces(userId: string, scope: ExportScope, now: Date): Promise<PortableSpace[]> {
  const where: Prisma.SpaceWhereInput = scope === "instance" ? {} : {
    OR: [
      { memberships: { some: { userId } } },
      {
        teamAccess: {
          some: {
            team: {
              members: {
                some: {
                  userId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          },
        },
      },
    ],
  };

  return db.space.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      folders: {
        select: { id: true, name: true, parentId: true, sortOrder: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      pages: {
        select: {
          id: true,
          title: true,
          slug: true,
          folderId: true,
          parentId: true,
          format: true,
          fileData: true,
          fileMime: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

async function* createExportEntries(
  spaces: PortableSpace[],
  layout: ReturnType<typeof buildPortableLayout>,
  scope: ExportScope,
  createdAt: Date,
  warnings: string[],
): AsyncGenerator<ZipEntry> {
  const pageCount = spaces.reduce((count, space) => count + space.pages.length, 0);
  const manifest = {
    format: "atlas-docs-portable-export",
    formatVersion: 2,
    createdAt: createdAt.toISOString(),
    scope,
    excludes: ["document version history", "accounts", "permissions", "sessions", "profile and space images"],
    warnings,
    spaces: spaces.map((space) => ({
      id: space.id,
      name: space.name,
      slug: space.slug,
      path: layout.spacePaths.get(space.id),
      pages: space.pages.map((page) => ({
        id: page.id,
        title: page.title,
        format: page.format,
        parentId: page.parentId,
        folderId: page.folderId,
        sourcePath: layout.pagePaths.get(page.id)?.sourcePath,
        canvasPath: layout.pagePaths.get(page.id)?.canvasPath,
      })),
    })),
  };

  yield {
    name: "README.md",
    data: portableReadme(createdAt, scope, spaces.length, pageCount, warnings),
  };
  yield { name: "manifest.json", data: `${JSON.stringify(manifest, null, 2)}\n` };

  for (const space of spaces) {
    for (const page of space.pages) {
      const pageLayout = layout.pagePaths.get(page.id);
      if (!pageLayout) continue;

      try {
        if (page.format === "FILE") {
          if (!pageLayout.sourcePath || !page.fileData) throw new Error("Uploaded file data is missing.");
          yield {
            name: pageLayout.sourcePath,
            data: page.fileData,
            compress: false,
          };
          continue;
        }
        const [storedDocument, imageMetadata] = await Promise.all([
          db.collabDocument.findUnique({
            where: { name: `page:${page.id}` },
            select: { data: true },
          }),
          db.pageImage.findMany({
            where: { pageId: page.id },
            select: { id: true, mime: true },
            orderBy: { createdAt: "asc" },
          }),
        ]);
        if (page.format === "TODO") {
          if (pageLayout.sourcePath) yield { name: pageLayout.sourcePath, data: serializeTodoBoardState(storedDocument?.data) };
          continue;
        }
        const current = decodeCollaborationDocument(
          storedDocument?.data || null,
          page.format === "CANVAS",
        );
        if (page.format === "CANVAS") {
          if (pageLayout.canvasPath && current.canvas) {
            yield { name: pageLayout.canvasPath, data: `${JSON.stringify(current.canvas, null, 2)}\n` };
          }
          continue;
        }
        if (!pageLayout.sourcePath) continue;
        const rewritten = rewriteImageReferences(
          current.source,
          page.id,
          pageLayout.relativeAssetsDirectory,
          imageMetadata,
        );

        yield { name: pageLayout.sourcePath, data: rewritten.source };
        for (const imageId of rewritten.referencedImageIds) {
          const image = await db.pageImage.findFirst({
            where: { id: imageId, pageId: page.id },
            select: { id: true, mime: true, data: true },
          });
          if (!image) continue;
          yield {
            name: `${pageLayout.assetsDirectory}/${image.id}.${imageExtension(image.mime)}`,
            data: image.data,
            compress: false,
          };
        }
      } catch (error) {
        console.error(`[atlas-export] Failed to export page ${page.id}.`, error);
        yield {
          name: `${pageLayout.sourcePath || pageLayout.canvasPath || `page-${page.id}`}.export-error.txt`,
          data: `Atlas Docs could not convert this page. The original page id is ${page.id}.\n`,
        };
      }
    }
  }
}

async function flushCurrentDocuments() {
  const secret = process.env.COLLAB_SECRET;
  if (!secret) throw new Error("COLLAB_SECRET is not configured.");
  const baseUrl = (process.env.COLLAB_INTERNAL_URL || "http://collab:1234").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/internal/flush`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Collaboration flush returned ${response.status}.`);
}

function portableReadme(
  createdAt: Date,
  scope: ExportScope,
  spaceCount: number,
  pageCount: number,
  warnings: string[],
) {
  const warningSection = warnings.length
    ? `\n## Warnings\n\n${warnings.map((warning) => `- ${warning}`).join("\n")}\n`
    : "";
  return `# Atlas Docs portable export

Created: ${createdAt.toISOString()}
Scope: ${scope}
Spaces: ${spaceCount}
Pages: ${pageCount}

Open the \`spaces\` directory as an Obsidian vault or as a normal folder in VS Code. Markdown, LaTeX, Mermaid, Gantt, and plain-text files contain their current text. Todo boards are exported as \`.todos.json\` files. Referenced page images use relative paths. Canvas files are stored as standard \`.excalidraw\` JSON and can be opened with the Obsidian Excalidraw plugin or another compatible editor. Uploaded unsupported files are included unchanged.

This portable emergency export intentionally excludes Atlas accounts, permissions, sessions, profile images, space cover images, and document version history. Use the PostgreSQL server backup for a complete operational restore.
${warningSection}
## Deutscher Hinweis

Der Ordner \`spaces\` kann direkt als Obsidian-Vault oder in VS Code geöffnet werden. Dieser Notfall-Export enthält den aktuellen Dokumentstand, referenzierte Seitenbilder und Canvas-Dateien, jedoch keine Versionshistorie oder Kontodaten.
`;
}
