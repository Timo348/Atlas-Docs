import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  parentId: z.string().min(1).nullable().optional(),
}).refine((value) => value.name !== undefined || value.parentId !== undefined);

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
  const updated = await db.folder.update({
    where: { id },
    data: { name: parsed.data.name, parentId: parsed.data.parentId },
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
