import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { readValidatedImage } from "@/lib/image-upload";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const user = await db.user.findUnique({
    where: { id },
    select: { avatarData: true, avatarMime: true },
  });
  if (!user?.avatarData || !user.avatarMime) return new NextResponse(null, { status: 404 });
  return new NextResponse(user.avatarData, {
    headers: {
      "Content-Type": user.avatarMime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const current = await requireApiUser();
  if (!current) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (id !== current.id) return NextResponse.json({ error: "Nur das eigene Profilbild darf geändert werden" }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Bild fehlt" }, { status: 400 });
    const image = await readValidatedImage(file);
    await db.user.update({
      where: { id },
      data: { avatarData: Buffer.from(image.bytes), avatarMime: image.mime },
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
  if (id !== current.id) return NextResponse.json({ error: "Nicht erlaubt" }, { status: 403 });
  await db.user.update({ where: { id }, data: { avatarData: null, avatarMime: null } });
  return new NextResponse(null, { status: 204 });
}
