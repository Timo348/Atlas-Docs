import { NextResponse } from "next/server";
import { requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { readValidatedImage } from "@/lib/image-upload";

async function canManage(user: { id: string; role: string }, spaceId: string) {
  return user.role === "ADMIN" || (await spaceAccess(user.id, spaceId)) === "OWNER";
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (current.role !== "ADMIN" && !await spaceAccess(current.id, id)) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }
  const space = await db.space.findUnique({
    where: { id },
    select: { imageData: true, imageMime: true },
  });
  if (!space?.imageData || !space.imageMime) return new NextResponse(null, { status: 404 });
  return new NextResponse(space.imageData, {
    headers: {
      "Content-Type": space.imageMime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (!await canManage(current, id)) return NextResponse.json({ error: "Nur Eigentümer und Administratoren" }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Bild fehlt" }, { status: 400 });
    const image = await readValidatedImage(file);
    await db.space.update({
      where: { id },
      data: { imageData: Buffer.from(image.bytes), imageMime: image.mime },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bild konnte nicht gespeichert werden" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (!await canManage(current, id)) return NextResponse.json({ error: "Nicht erlaubt" }, { status: 403 });
  await db.space.update({ where: { id }, data: { imageData: null, imageMime: null } });
  return new NextResponse(null, { status: 204 });
}
