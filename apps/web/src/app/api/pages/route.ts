import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { collaborationDocumentName, createInitialCollaborationState, resolveCollaborationLanguage } from "@/lib/collaboration-document";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  folderId: z.string().min(1).nullable().optional(),
  format: z.enum(["MARKDOWN", "LATEX", "CANVAS"]).default("MARKDOWN"),
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);

  const role = await spaceAccess(user.id, parsed.data.spaceId);
  if (!canEdit(role)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
  }

  if (parsed.data.parentId) {
    const parent = await db.page.findFirst({
      where: { id: parsed.data.parentId, spaceId: parsed.data.spaceId },
    });
    if (!parent) return apiErrorResponse("PAGE_PARENT_INVALID", 400);
  }

  if (parsed.data.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: parsed.data.folderId, spaceId: parsed.data.spaceId },
    });
    if (!folder) return apiErrorResponse("FOLDER_INVALID", 400);
  }

  const baseSlug = slugify(parsed.data.title);
  const exists = await db.page.findUnique({
    where: { spaceId_slug: { spaceId: parsed.data.spaceId, slug: baseSlug } },
    select: { id: true },
  });
  const slug = exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
  const lastPage = await db.page.aggregate({
    where: { spaceId: parsed.data.spaceId, folderId: parsed.data.folderId || null },
    _max: { sortOrder: true },
  });
  const language = resolveCollaborationLanguage(user.language, undefined);
  const page = await db.$transaction(async (transaction) => {
    const createdPage = await transaction.page.create({
      data: {
        title: parsed.data.title,
        slug,
        spaceId: parsed.data.spaceId,
        parentId: parsed.data.parentId || null,
        folderId: parsed.data.folderId || null,
        format: parsed.data.format,
        sortOrder: (lastPage._max.sortOrder ?? -1) + 1,
        createdById: user.id,
      },
    });
    await transaction.collabDocument.create({
      data: {
        name: collaborationDocumentName(createdPage.id),
        data: Buffer.from(createInitialCollaborationState(parsed.data.format, language)),
      },
    });
    return createdPage;
  });
  return NextResponse.json(page, { status: 201 });
}
