import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const schema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  password: z.string().min(12).max(128).optional(),
}).refine((value) => value.active !== undefined || value.role !== undefined || value.password !== undefined);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireApiUser();
  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur für Administratoren" }, { status: 403 });
  }
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  if (id === admin.id && (parsed.data.active === false || parsed.data.role === "MEMBER")) {
    return NextResponse.json({ error: "Das eigene Administratorkonto kann nicht entzogen werden" }, { status: 400 });
  }
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Benutzer nicht gefunden" }, { status: 404 });
  if (target.role === "ADMIN" && (parsed.data.active === false || parsed.data.role === "MEMBER")) {
    const activeAdmins = await db.user.count({ where: { role: "ADMIN", active: true } });
    if (activeAdmins <= 1) {
      return NextResponse.json({ error: "Der letzte aktive Administrator bleibt erforderlich" }, { status: 400 });
    }
  }
  const user = await db.user.update({
    where: { id },
    data: {
      active: parsed.data.active,
      role: parsed.data.role,
      passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return NextResponse.json(user);
}
