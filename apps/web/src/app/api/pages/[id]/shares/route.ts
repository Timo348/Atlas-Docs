import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { createPageShareToken, pageShareTokenHash } from "@/lib/page-share";
import { pageShareManagementPage, pageShareResponse } from "@/lib/page-share-management";

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  permission: z.enum(["VIEW", "EDIT"]),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const access = await pageShareManagementPage(user, id);
  if (!access.page || !access.allowed) return apiErrorResponse("PAGE_SHARE_MANAGE_REQUIRED", 403);

  const shares = await db.pageShare.findMany({
    where: { pageId: id },
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
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(shares.map(pageShareResponse), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const access = await pageShareManagementPage(user, id);
  if (!access.page || !access.allowed) return apiErrorResponse("PAGE_SHARE_MANAGE_REQUIRED", 403);

  const parsed = createSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PAGE_SHARE_INVALID", 400);
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) return apiErrorResponse("PAGE_SHARE_INVALID", 400);
  const activeCount = await db.pageShare.count({
    where: {
      pageId: id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (activeCount >= 25) return apiErrorResponse("PAGE_SHARE_INVALID", 400);

  const token = createPageShareToken();
  const share = await db.pageShare.create({
    data: {
      pageId: id,
      createdById: user.id,
      label: parsed.data.label,
      permission: parsed.data.permission,
      expiresAt,
      tokenHash: pageShareTokenHash(token),
      tokenPrefix: token.slice(0, 8),
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
  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const url = new URL(`/share/${token}`, origin).toString();
  return NextResponse.json({ ...pageShareResponse(share), url }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
