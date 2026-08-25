import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { folderShareManagementFolder, folderShareResponse } from "@/lib/folder-share-management";
import { createPageShareToken, pageShareTokenHash } from "@/lib/page-share";

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  permission: z.enum(["VIEW", "EDIT"]),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

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

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const access = await folderShareManagementFolder(user, id);
  if (!access.folder || !access.allowed) return apiErrorResponse("FOLDER_SHARE_MANAGE_REQUIRED", 403);
  const shares = await db.folderShare.findMany({
    where: { folderId: id },
    select: selection,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(shares.map(folderShareResponse), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const access = await folderShareManagementFolder(user, id);
  if (!access.folder || !access.allowed) return apiErrorResponse("FOLDER_SHARE_MANAGE_REQUIRED", 403);
  const parsed = createSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("FOLDER_SHARE_INVALID", 400);
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) return apiErrorResponse("FOLDER_SHARE_INVALID", 400);
  const activeCount = await db.folderShare.count({
    where: {
      folderId: id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (activeCount >= 25) return apiErrorResponse("FOLDER_SHARE_INVALID", 400);
  const token = createPageShareToken();
  const share = await db.folderShare.create({
    data: {
      folderId: id,
      createdById: user.id,
      label: parsed.data.label,
      permission: parsed.data.permission,
      expiresAt,
      tokenHash: pageShareTokenHash(token),
      tokenPrefix: token.slice(0, 8),
    },
    select: selection,
  });
  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin;
  const url = new URL(`/share/folder/${token}`, origin).toString();
  return NextResponse.json({ ...folderShareResponse(share), url }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
