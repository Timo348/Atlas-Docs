import { NextResponse } from "next/server";
import { z } from "zod";
import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

const schema = z.object({
  title: z.string().trim().min(1).max(160),
  spaceId: z.string().min(1),
  parentId: z.string().min(1).nullable().optional(),
  folderId: z.string().min(1).nullable().optional(),
  format: z.enum(["MARKDOWN", "LATEX"]).default("MARKDOWN"),
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });

  const role = await spaceAccess(user.id, parsed.data.spaceId);
  if (!canEdit(role)) {
    return NextResponse.json({ error: "Kein Schreibzugriff" }, { status: 403 });
  }

  if (parsed.data.parentId) {
    const parent = await db.page.findFirst({
      where: { id: parsed.data.parentId, spaceId: parsed.data.spaceId },
    });
    if (!parent) return NextResponse.json({ error: "Ungültige übergeordnete Seite" }, { status: 400 });
  }

  if (parsed.data.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: parsed.data.folderId, spaceId: parsed.data.spaceId },
    });
    if (!folder) return NextResponse.json({ error: "Ungültiger Ordner" }, { status: 400 });
  }

  const baseSlug = slugify(parsed.data.title);
  const exists = await db.page.findUnique({
    where: { spaceId_slug: { spaceId: parsed.data.spaceId, slug: baseSlug } },
    select: { id: true },
  });
  const slug = exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
  const page = await db.page.create({
    data: {
      title: parsed.data.title,
      slug,
      spaceId: parsed.data.spaceId,
      parentId: parsed.data.parentId || null,
      folderId: parsed.data.folderId || null,
      format: parsed.data.format,
      createdById: user.id,
    },
  });
  return NextResponse.json(page, { status: 201 });
}
