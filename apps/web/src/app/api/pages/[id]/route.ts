import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const updateSchema = z.object({ title: z.string().trim().min(1).max(160) });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page || !canEdit(page.space.memberships[0].role)) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const updated = await db.page.update({ where: { id }, data: { title: parsed.data.title } });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page || !canEdit(page.space.memberships[0].role)) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }
  await db.$transaction([
    db.collabDocument.deleteMany({ where: { name: `page:${id}` } }),
    db.page.delete({ where: { id } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
