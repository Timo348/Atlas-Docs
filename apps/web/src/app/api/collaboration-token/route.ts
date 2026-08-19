import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import {
  collaborationStateNeedsInitialization,
  initialCollaborationDocumentUpsert,
  resolveCollaborationLanguage,
} from "@/lib/collaboration-document";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);

  const pageId = request.nextUrl.searchParams.get("pageId");
  if (!pageId) return apiErrorResponse("COLLABORATION_PAGE_ID_REQUIRED", 400);

  const page = await pageAccess(user.id, pageId);
  if (!page) return apiErrorResponse("ACCESS_DENIED", 403);
  if (page.format === "PDF") return apiErrorResponse("COLLABORATION_PAGE_ID_REQUIRED", 400);

  const secret = process.env.COLLAB_SECRET;
  if (!secret || secret.length < 32) {
    return apiErrorResponse("COLLABORATION_NOT_CONFIGURED", 500);
  }

  const creator = page.createdById === user.id
    ? user
    : await db.user.findUnique({
      where: { id: page.createdById },
      select: { language: true },
    });
  const language = resolveCollaborationLanguage(creator?.language, user.language);
  const initialization = initialCollaborationDocumentUpsert(page.id, page.format, language);
  await db.$transaction(async (transaction) => {
    // Materialize a missing row first, then lock it so concurrent token requests
    // cannot both decide to repair the same legacy placeholder independently.
    await transaction.collabDocument.upsert({
      ...initialization,
      create: {
        ...initialization.create,
        data: Buffer.from(initialization.create.data),
      },
    });

    const documents = await transaction.$queryRaw<{ data: Uint8Array }[]>`
      SELECT "data"
      FROM "CollabDocument"
      WHERE "name" = ${initialization.where.name}
      FOR UPDATE
    `;
    const document = documents[0];
    if (!document) throw new Error("Collaboration document initialization failed.");
    if (!collaborationStateNeedsInitialization(document.data)) return;

    await transaction.collabDocument.update({
      where: initialization.where,
      data: { data: Buffer.from(initialization.create.data) },
    });
  });

  const token = await new SignJWT({
    pageId,
    name: user.name || user.email,
    readOnly: !canEdit(page.accessRole),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({
    token,
    readOnly: !canEdit(page.accessRole),
    user: { id: user.id, name: user.name || user.email },
  });
}
