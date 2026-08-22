import { NextResponse } from "next/server";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { collaborationDocumentName, createTextCollaborationState } from "@/lib/collaboration-document";
import { db } from "@/lib/db";
import { isGanttImportName, isMermaidImportName, isPlainTextImportName, MAX_IMPORTED_FILE_BYTES } from "@/lib/page-file";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const spaceIdValue = form?.get("spaceId");
  const spaceId = typeof spaceIdValue === "string" ? spaceIdValue : "";
  const folderIdValue = form?.get("folderId");
  const folderId = typeof folderIdValue === "string" && folderIdValue ? folderIdValue : null;
  if (!(file instanceof File) || !spaceId || !file.name || file.name.length > 160) {
    return apiErrorResponse("FILE_IMPORT_INVALID", 400);
  }
  if (file.size > MAX_IMPORTED_FILE_BYTES) return apiErrorResponse("FILE_TOO_LARGE", 413);

  const role = await spaceAccess(user.id, spaceId);
  if (!canEdit(role)) return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
  if (folderId) {
    const folder = await db.folder.findFirst({ where: { id: folderId, spaceId }, select: { id: true } });
    if (!folder) return apiErrorResponse("FOLDER_INVALID", 400);
  }

  const data = Buffer.from(await file.arrayBuffer());
  const sourceText = decodeImportedText(file.name, data);
  const format = sourceText === null ? "FILE" : isGanttImportName(file.name) ? "GANTT" : isMermaidImportName(file.name) ? "MERMAID" : "TEXT";
  const baseSlug = slugify(file.name);
  const exists = await db.page.findUnique({
    where: { spaceId_slug: { spaceId, slug: baseSlug } },
    select: { id: true },
  });
  const slug = exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
  const lastPage = await db.page.aggregate({
    where: { spaceId, folderId },
    _max: { sortOrder: true },
  });
  const page = await db.$transaction(async (transaction) => {
    const created = await transaction.page.create({
      data: {
        title: file.name,
        slug,
        spaceId,
        folderId,
        format,
        sortOrder: (lastPage?._max?.sortOrder ?? -1) + 1,
        createdById: user.id,
        ...(format === "FILE" ? {
          fileData: data,
          fileMime: file.type || "application/octet-stream",
          fileSize: file.size,
        } : {}),
      },
    });
    if (sourceText !== null) {
      await transaction.collabDocument.create({
        data: {
          name: collaborationDocumentName(created.id),
          data: Buffer.from(createTextCollaborationState(sourceText)),
        },
      });
    }
    return created;
  });
  return NextResponse.json(page, { status: 201 });
}

function decodeImportedText(name: string, data: Buffer) {
  if (!isPlainTextImportName(name) && !isMermaidImportName(name) && !isGanttImportName(name)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    return null;
  }
}
