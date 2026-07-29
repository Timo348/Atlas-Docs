import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);
  const role = await spaceAccess(user.id, parsed.data.spaceId);
  if (!canEdit(role)) return apiErrorResponse("WRITE_ACCESS_REQUIRED", 403);

  if (parsed.data.parentId) {
    const parent = await db.folder.findFirst({
      where: { id: parsed.data.parentId, spaceId: parsed.data.spaceId },
      select: { id: true },
    });
    if (!parent) return apiErrorResponse("FOLDER_PARENT_INVALID", 400);
  }

  const duplicate = await db.folder.findFirst({
    where: {
      name: { equals: parsed.data.name, mode: "insensitive" },
      spaceId: parsed.data.spaceId,
      parentId: parsed.data.parentId || null,
    },
    select: { id: true },
  });
  if (duplicate) {
    return apiErrorResponse("FOLDER_NAME_CONFLICT", 409);
  }

  const lastFolder = await db.folder.aggregate({
    where: { spaceId: parsed.data.spaceId, parentId: parsed.data.parentId || null },
    _max: { sortOrder: true },
  });
  const folder = await db.folder.create({
    data: {
      name: parsed.data.name,
      spaceId: parsed.data.spaceId,
      parentId: parsed.data.parentId || null,
      sortOrder: (lastFolder._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json(folder, { status: 201 });
}
