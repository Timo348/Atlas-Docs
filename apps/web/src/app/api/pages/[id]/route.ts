import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { insertAt } from "@/lib/tree-order";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  folderId: z.string().min(1).nullable().optional(),
  position: z.number().int().min(0).optional(),
}).refine((value) => value.title !== undefined || value.folderId !== undefined || value.position !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page || !canEdit(page.accessRole)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
  }
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);
  if (parsed.data.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: parsed.data.folderId, spaceId: page.spaceId },
      select: { id: true },
    });
    if (!folder) return apiErrorResponse("FOLDER_INVALID", 400);
  }
  const moving = parsed.data.folderId !== undefined || parsed.data.position !== undefined;
  if (!moving) {
    const updated = await db.page.update({
      where: { id },
      data: { title: parsed.data.title },
    });
    return NextResponse.json(updated);
  }
  const targetFolderId = parsed.data.folderId !== undefined ? parsed.data.folderId : page.folderId;
  const updated = await db.$transaction(async (transaction) => {
    const siblings = await transaction.page.findMany({
      where: { spaceId: page.spaceId, folderId: targetFolderId, id: { not: id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const orderedIds = insertAt(
      siblings.map((sibling) => sibling.id),
      id,
      parsed.data.position ?? siblings.length,
    );
    await transaction.page.update({
      where: { id },
      data: { title: parsed.data.title, folderId: targetFolderId },
    });
    await Promise.all(orderedIds.map((pageId, sortOrder) => transaction.page.update({
      where: { id: pageId },
      data: { sortOrder },
    })));
    return transaction.page.findUniqueOrThrow({ where: { id } });
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page || !canEdit(page.accessRole)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);
  }
  await db.$transaction([
    db.page.delete({ where: { id } }),
    db.collabDocument.deleteMany({ where: { name: `page:${id}` } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
