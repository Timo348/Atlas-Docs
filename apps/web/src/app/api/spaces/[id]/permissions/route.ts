import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, spaceAccess } from "@/lib/access";
import { db } from "@/lib/db";

const roleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);
const updateSchema = z.object({
  users: z.array(z.object({ id: z.string().min(1), role: roleSchema })).max(500),
  teams: z.array(z.object({
    id: z.string().min(1),
    role: z.enum(["EDITOR", "VIEWER"]),
  })).max(500),
});

async function canManage(user: { id: string; role: string }, spaceId: string) {
  return user.role === "ADMIN" || (await spaceAccess(user.id, spaceId)) === "OWNER";
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (!await canManage(user, id)) {
    return NextResponse.json({ error: "Nur Bereichseigentümer dürfen Rechte verwalten" }, { status: 403 });
  }

  const [space, users, teams] = await Promise.all([
    db.space.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        imageMime: true,
        memberships: { select: { userId: true, role: true } },
        teamAccess: { select: { teamId: true, role: true } },
      },
    }),
    db.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    db.team.findMany({
      select: {
        id: true,
        name: true,
        members: { select: { userId: true, expiresAt: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!space) return NextResponse.json({ error: "Bereich nicht gefunden" }, { status: 404 });
  return NextResponse.json({ space, users, teams, canManageTeams: user.role === "ADMIN" });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id } = await context.params;
  if (!await canManage(user, id)) {
    return NextResponse.json({ error: "Nur Bereichseigentümer dürfen Rechte verwalten" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Rechteauswahl" }, { status: 400 });

  const userGrants = parsed.data.users.filter((grant) => grant.id !== user.id);
  const userIds = [...new Set(userGrants.map((grant) => grant.id))];
  const teamIds = [...new Set(parsed.data.teams.map((grant) => grant.id))];
  if (userIds.length !== userGrants.length || teamIds.length !== parsed.data.teams.length) {
    return NextResponse.json({ error: "Doppelte Freigabe" }, { status: 400 });
  }
  const [validUsers, validTeams] = await Promise.all([
    db.user.count({ where: { id: { in: userIds }, active: true } }),
    db.team.count({ where: { id: { in: teamIds } } }),
  ]);
  if (validUsers !== userIds.length || validTeams !== teamIds.length) {
    return NextResponse.json({ error: "Benutzer oder Team nicht gefunden" }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.membership.deleteMany({ where: { spaceId: id, userId: { not: user.id } } });
    await tx.membership.upsert({
      where: { userId_spaceId: { userId: user.id, spaceId: id } },
      update: { role: "OWNER" },
      create: { userId: user.id, spaceId: id, role: "OWNER" },
    });
    if (userGrants.length) {
      await tx.membership.createMany({
        data: userGrants.map((grant) => ({ userId: grant.id, spaceId: id, role: grant.role })),
      });
    }
    await tx.spaceTeamAccess.deleteMany({ where: { spaceId: id } });
    if (parsed.data.teams.length) {
      await tx.spaceTeamAccess.createMany({
        data: parsed.data.teams.map((grant) => ({ teamId: grant.id, spaceId: id, role: grant.role })),
      });
    }
  });
  return NextResponse.json({ ok: true });
}
