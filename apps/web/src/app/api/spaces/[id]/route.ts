import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import {
  collaborationDocumentsForPages,
  confirmsSpaceDeletion,
} from "@/lib/space-deletion";
import { strongestSpaceRole, type EffectiveSpaceRole } from "@/lib/space-role";

const deleteSchema = z.object({
  confirmation: z.string().max(80),
});

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const { id } = await context.params;
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  const outcome = await db.$transaction(async (transaction) => {
    const spaces = await transaction.$queryRaw<{ name: string }[]>`
      SELECT "name"
      FROM "Space"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    const space = spaces[0];
    if (!space) return "not-found" as const;

    const users = await transaction.$queryRaw<{ role: "ADMIN" | "MEMBER" }[]>`
      SELECT "role"
      FROM "User"
      WHERE "id" = ${user.id} AND "active" = true
      FOR SHARE
    `;
    const currentUser = users[0];
    if (!currentUser) return "forbidden" as const;

    let canDelete = currentUser.role === "ADMIN";
    if (!canDelete) {
      const directGrants = await transaction.$queryRaw<{ role: EffectiveSpaceRole }[]>`
        SELECT "role"
        FROM "Membership"
        WHERE "userId" = ${user.id} AND "spaceId" = ${id}
        FOR SHARE
      `;
      const teamGrants = await transaction.$queryRaw<{ role: EffectiveSpaceRole }[]>`
        SELECT sta."role"
        FROM "SpaceTeamAccess" AS sta
        INNER JOIN "TeamMember" AS tm ON tm."teamId" = sta."teamId"
        WHERE sta."spaceId" = ${id}
          AND tm."userId" = ${user.id}
          AND (tm."expiresAt" IS NULL OR tm."expiresAt" > NOW())
        FOR SHARE OF sta, tm
      `;
      canDelete = strongestSpaceRole([
        directGrants[0]?.role,
        ...teamGrants.map((grant) => grant.role),
      ]) === "OWNER";
    }
    if (!canDelete) return "forbidden" as const;

    if (!parsed.success || !confirmsSpaceDeletion(parsed.data.confirmation, space.name)) {
      return "confirmation-mismatch" as const;
    }

    const pages = await transaction.page.findMany({
      where: { spaceId: id },
      select: { id: true },
    });
    const documentNames = collaborationDocumentsForPages(pages.map((page) => page.id));
    await transaction.space.delete({ where: { id } });
    if (documentNames.length) {
      await transaction.collabDocument.deleteMany({ where: { name: { in: documentNames } } });
    }
    return "deleted" as const;
  });

  if (outcome === "not-found") {
    return apiErrorResponse("SPACE_NOT_FOUND", 404);
  }
  if (outcome === "forbidden") {
    return apiErrorResponse("SPACE_DELETE_REQUIRED", 403);
  }
  if (outcome === "confirmation-mismatch") {
    return apiErrorResponse("SPACE_DELETE_CONFIRMATION_MISMATCH", 400);
  }

  return new NextResponse(null, { status: 204 });
}
