import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const role = await spaceAccess(user.id, parsed.data.spaceId);
  if (!canEdit(role)) return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });

  if (parsed.data.parentId) {
    const parent = await db.folder.findFirst({
      where: { id: parsed.data.parentId, spaceId: parsed.data.spaceId },
      select: { id: true },
    });
    if (!parent) return NextResponse.json({ error: "Ungültiger übergeordneter Ordner" }, { status: 400 });
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
    return NextResponse.json({ error: "In dieser Ebene existiert bereits ein Ordner mit diesem Namen" }, { status: 409 });
  }

  const folder = await db.folder.create({
    data: {
      name: parsed.data.name,
      spaceId: parsed.data.spaceId,
      parentId: parsed.data.parentId || null,
    },
  });
  return NextResponse.json(folder, { status: 201 });
}
