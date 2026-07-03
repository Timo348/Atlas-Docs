import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export async function GET() {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur für Administratoren" }, { status: 403 });
  }
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const admin = await requireApiUser();
  if (!admin || admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur für Administratoren" }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Name, gültige E-Mail und mindestens 12 Zeichen Passwort erforderlich" }, { status: 400 });
  }
  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return NextResponse.json({ error: "E-Mail ist bereits vergeben" }, { status: 409 });
  const start = await db.space.findUnique({ where: { slug: "start" } });
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: parsed.data.role,
      memberships: start ? { create: { spaceId: start.id, role: "EDITOR" } } : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  return NextResponse.json(user, { status: 201 });
}
