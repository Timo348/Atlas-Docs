import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional(),
});

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });

  const baseSlug = slugify(parsed.data.name);
  const exists = await db.space.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  const slug = exists ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
  const space = await db.space.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      slug,
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  return NextResponse.json(space, { status: 201 });
}
