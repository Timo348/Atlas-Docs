import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { pageShareManagementPage, pageShareResponse } from "@/lib/page-share-management";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  permission: z.enum(["VIEW", "EDIT"]).optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; shareId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id, shareId } = await context.params;
  const access = await pageShareManagementPage(user, id);
  if (!access.page || !access.allowed) return apiErrorResponse("PAGE_SHARE_MANAGE_REQUIRED", 403);
  const existing = await db.pageShare.findFirst({ where: { id: shareId, pageId: id, revokedAt: null } });
  if (!existing) return apiErrorResponse("PAGE_SHARE_NOT_FOUND", 404);

  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PAGE_SHARE_INVALID", 400);
  if (access.page.format === "PDF" && parsed.data.permission === "EDIT") {
    return apiErrorResponse("PAGE_SHARE_INVALID", 400);
  }
  const expiresAt = parsed.data.expiresAt === undefined
    ? undefined
    : parsed.data.expiresAt === null ? null : new Date(parsed.data.expiresAt);
  if (expiresAt instanceof Date && expiresAt <= new Date()) return apiErrorResponse("PAGE_SHARE_INVALID", 400);
  const share = await db.pageShare.update({
    where: { id: shareId },
    data: {
      label: parsed.data.label,
      permission: parsed.data.permission,
      expiresAt,
    },
    select: {
      id: true,
      label: true,
      tokenPrefix: true,
      permission: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  });
  return NextResponse.json(pageShareResponse(share), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string; shareId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id, shareId } = await context.params;
  const access = await pageShareManagementPage(user, id);
  if (!access.page || !access.allowed) return apiErrorResponse("PAGE_SHARE_MANAGE_REQUIRED", 403);
  const result = await db.pageShare.updateMany({
    where: { id: shareId, pageId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return apiErrorResponse("PAGE_SHARE_NOT_FOUND", 404);
  return new NextResponse(null, { status: 204 });
}
