import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  members: z.array(z.object({
    userId: z.string().min(1),
    expiresAt: z.string().datetime().nullable(),
  })).max(500).default([]),
});

export async function GET() {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Administratoren dürfen Teams verwalten" }, { status: 403 });
  }
  const teams = await db.team.findMany({
    select: {
      id: true,
      name: true,
      members: {
        select: {
          userId: true,
          expiresAt: true,
          user: { select: { name: true, email: true } },
        },
      },
      spaces: { select: { spaceId: true, role: true, space: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(teams);
}

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Administratoren dürfen Teams verwalten" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const userIds = [...new Set(parsed.data.members.map((member) => member.userId))];
  if (userIds.length !== parsed.data.members.length) {
    return NextResponse.json({ error: "Benutzer darf pro Team nur einmal vorkommen" }, { status: 400 });
  }
  const validUsers = await db.user.count({ where: { id: { in: userIds }, active: true } });
  if (validUsers !== userIds.length) {
    return NextResponse.json({ error: "Mindestens ein Benutzer wurde nicht gefunden" }, { status: 400 });
  }
  const duplicate = await db.team.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Ein Team mit diesem Namen existiert bereits" }, { status: 409 });
  const team = await db.team.create({
    data: {
      name: parsed.data.name,
      members: {
        create: parsed.data.members.map((member) => ({
          userId: member.userId,
          expiresAt: member.expiresAt ? new Date(member.expiresAt) : null,
        })),
      },
    },
    select: { id: true, name: true },
  });
  return NextResponse.json(team, { status: 201 });
}
