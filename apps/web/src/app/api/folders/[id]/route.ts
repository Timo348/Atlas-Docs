import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { insertAt } from "@/lib/tree-order";

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().min(1).nullable().optional(),
  position: z.number().int().min(0).optional(),
}).refine((value) => value.name !== undefined || value.parentId !== undefined || value.position !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const folder = await db.folder.findUnique({ where: { id } });
  if (!folder || !canEdit(await spaceAccess(user.id, folder.spaceId))) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  if (parsed.data.parentId === id) {
    return NextResponse.json({ error: "Ein Ordner kann nicht in sich selbst liegen" }, { status: 400 });
  }
  if (parsed.data.parentId) {
    const descendants = await collectDescendantIds(id);
    if (descendants.has(parsed.data.parentId)) {
      return NextResponse.json({ error: "Ein Ordner kann nicht in einen Unterordner verschoben werden" }, { status: 400 });
    }
    const parent = await db.folder.findFirst({
      where: { id: parsed.data.parentId, spaceId: folder.spaceId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Ungültiger Zielordner" }, { status: 400 });
  }
  const duplicate = await db.folder.findFirst({
    where: {
      id: { not: id },
      spaceId: folder.spaceId,
      parentId: parsed.data.parentId !== undefined ? parsed.data.parentId : folder.parentId,
      name: { equals: parsed.data.name || folder.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "In dieser Ebene existiert bereits ein Ordner mit diesem Namen" }, { status: 409 });
  }
  const moving = parsed.data.parentId !== undefined || parsed.data.position !== undefined;
  if (!moving) {
    const updated = await db.folder.update({
      where: { id },
      data: { name: parsed.data.name },
    });
    return NextResponse.json(updated);
  }
  const targetParentId = parsed.data.parentId !== undefined ? parsed.data.parentId : folder.parentId;
  const updated = await db.$transaction(async (transaction) => {
    const siblings = await transaction.folder.findMany({
      where: { spaceId: folder.spaceId, parentId: targetParentId, id: { not: id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const orderedIds = insertAt(
      siblings.map((sibling) => sibling.id),
      id,
      parsed.data.position ?? siblings.length,
    );
    await transaction.folder.update({
      where: { id },
      data: { name: parsed.data.name, parentId: targetParentId },
    });
    await Promise.all(orderedIds.map((folderId, sortOrder) => transaction.folder.update({
      where: { id: folderId },
      data: { sortOrder },
    })));
    return transaction.folder.findUniqueOrThrow({ where: { id } });
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const folder = await db.folder.findUnique({ where: { id } });
  if (!folder || !canEdit(await spaceAccess(user.id, folder.spaceId))) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }
  await db.folder.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

async function collectDescendantIds(rootId: string) {
  const result = new Set<string>();
  let parentIds = [rootId];
  while (parentIds.length) {
    const children = await db.folder.findMany({
      where: { parentId: { in: parentIds } },
      select: { id: true },
    });
    parentIds = children.map((child) => child.id).filter((id) => !result.has(id));
    parentIds.forEach((id) => result.add(id));
  }
  return result;
}
