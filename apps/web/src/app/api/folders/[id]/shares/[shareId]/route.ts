import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { folderShareManagementFolder, folderShareResponse } from "@/lib/folder-share-management";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  permission: z.enum(["VIEW", "EDIT"]).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

const selection = {
  id: true,
  label: true,
  tokenPrefix: true,
  permission: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; shareId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id, shareId } = await context.params;
  const access = await folderShareManagementFolder(user, id);
  if (!access.folder || !access.allowed) return apiErrorResponse("FOLDER_SHARE_MANAGE_REQUIRED", 403);
  const existing = await db.folderShare.findFirst({ where: { id: shareId, folderId: id, revokedAt: null } });
  if (!existing) return apiErrorResponse("FOLDER_SHARE_NOT_FOUND", 404);
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("FOLDER_SHARE_INVALID", 400);
  const expiresAt = parsed.data.expiresAt === undefined
    ? undefined
    : parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt);
  if (expiresAt instanceof Date && expiresAt <= new Date()) return apiErrorResponse("FOLDER_SHARE_INVALID", 400);
  const share = await db.folderShare.update({
    where: { id: shareId },
    data: { label: parsed.data.label, permission: parsed.data.permission, expiresAt },
    select: selection,
  });
  return NextResponse.json(folderShareResponse(share), { headers: { "Cache-Control": "no-store" } });
}
export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string; shareId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id, shareId } = await context.params;
  const access = await folderShareManagementFolder(user, id);
  if (!access.folder || !access.allowed) return apiErrorResponse("FOLDER_SHARE_MANAGE_REQUIRED", 403);
  const result = await db.folderShare.updateMany({
    where: { id: shareId, folderId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return apiErrorResponse("FOLDER_SHARE_NOT_FOUND", 404);
  return new NextResponse(null, { status: 204 });
}
