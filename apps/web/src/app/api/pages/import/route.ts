import { NextResponse } from "next/server";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, isCodedApiError } from "@/lib/api-errors";
import { collaborationDocumentName } from "@/lib/collaboration-document";
import { db } from "@/lib/db";
import { readImportedFile } from "@/lib/file-import";
import { slugify } from "@/lib/slug";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  try {
    const form = await request.formData();
    const file = form.get("file");
    const title = stringField(form, "title")?.trim();
    const spaceId = stringField(form, "spaceId");
    const folderId = nullableStringField(form, "folderId");
    if (!(file instanceof File)) return apiErrorResponse("FILE_MISSING", 400);
    if (!title || title.length > 160 || !spaceId) return apiErrorResponse("INVALID_INPUT", 400);

    const role = await spaceAccess(user.id, spaceId);
    if (!canEdit(role)) return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
    if (folderId) {
      const folder = await db.folder.findFirst({ where: { id: folderId, spaceId }, select: { id: true } });
      if (!folder) return apiErrorResponse("FOLDER_INVALID", 400);
    }

    const imported = await readImportedFile(file);
    const baseSlug = slugify(title);
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
          title,
          slug,
          spaceId,
          folderId,
          format: imported.format,
          sortOrder: (lastPage._max.sortOrder ?? -1) + 1,
          createdById: user.id,
        },
      });
      if (imported.format === "PDF") {
        await transaction.pageAsset.create({
          data: {
            pageId: created.id,
            createdById: user.id,
            kind: "DOCUMENT",
            name: imported.name,
            mime: "application/pdf",
            size: imported.bytes.byteLength,
            data: Buffer.from(imported.bytes),
          },
        });
      } else {
        await transaction.collabDocument.create({
          data: {
            name: collaborationDocumentName(created.id),
            data: Buffer.from(imported.collaborationState),
          },
        });
      }
      return created;
    });
    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    if (isCodedApiError(error)) return apiErrorResponse(error.code, 400);
    console.error("[atlas-api] File import failed.", error);
    return apiErrorResponse("FILE_SAVE_FAILED", 500);
  }
}

function stringField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value ? value : null;
}

function nullableStringField(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value ? value : null;
}
