import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  members: z.array(z.object({
    userId: z.string().min(1),
    expiresAt: z.string().datetime().nullable(),
  })).max(500),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Administratoren dürfen Teams verwalten" }, { status: 403 });
  }
  const { id } = await context.params;
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
    where: { id: { not: id }, name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Ein Team mit diesem Namen existiert bereits" }, { status: 409 });
  const team = await db.$transaction(async (tx) => {
    await tx.teamMember.deleteMany({ where: { teamId: id } });
    return tx.team.update({
      where: { id },
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
  });
  return NextResponse.json(team);
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nur Administratoren dürfen Teams verwalten" }, { status: 403 });
  }
  const { id } = await context.params;
  await db.team.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
