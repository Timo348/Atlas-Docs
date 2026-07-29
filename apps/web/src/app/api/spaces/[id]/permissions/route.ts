import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
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
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  if (!await canManage(user, id)) {
    return apiErrorResponse("SPACE_PERMISSION_MANAGE_REQUIRED", 403);
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
  if (!space) return apiErrorResponse("SPACE_NOT_FOUND", 404);
  return NextResponse.json({ space, users, teams, canManageTeams: user.role === "ADMIN" });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  if (!await canManage(user, id)) {
    return apiErrorResponse("SPACE_PERMISSION_MANAGE_REQUIRED", 403);
  }
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PERMISSIONS_INVALID", 400);

  const userGrants = parsed.data.users.filter((grant) => grant.id !== user.id);
  const userIds = [...new Set(userGrants.map((grant) => grant.id))];
  const teamIds = [...new Set(parsed.data.teams.map((grant) => grant.id))];
  if (userIds.length !== userGrants.length || teamIds.length !== parsed.data.teams.length) {
    return apiErrorResponse("PERMISSION_DUPLICATE", 400);
  }
  const [validUsers, validTeams] = await Promise.all([
    db.user.count({ where: { id: { in: userIds }, active: true } }),
    db.team.count({ where: { id: { in: teamIds } } }),
  ]);
  if (validUsers !== userIds.length || validTeams !== teamIds.length) {
    return apiErrorResponse("PERMISSION_SUBJECT_NOT_FOUND", 400);
  }

  const outcome = await db.$transaction(async (tx) => {
    const spaces = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "Space"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    if (!spaces.length) return "not-found" as const;

    const current = await tx.user.findFirst({
      where: { id: user.id, active: true },
      select: { id: true, role: true },
    });
    if (!current || (current.role !== "ADMIN" && await spaceAccess(current.id, id, tx) !== "OWNER")) {
      return "forbidden" as const;
    }

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
    return "updated" as const;
  });
  if (outcome === "not-found") {
    return apiErrorResponse("SPACE_NOT_FOUND", 404);
  }
  if (outcome === "forbidden") {
    return apiErrorResponse("SPACE_PERMISSION_MANAGE_REQUIRED", 403);
  }
  return NextResponse.json({ ok: true });
}
