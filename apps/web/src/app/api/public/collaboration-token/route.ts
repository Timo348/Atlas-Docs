import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { activePageShare } from "@/lib/page-share-server";
import { pageShareIsReadOnly } from "@/lib/page-share";
import {
  collaborationStateNeedsInitialization,
  initialCollaborationDocumentUpsert,
  resolveCollaborationLanguage,
} from "@/lib/collaboration-document";
import { db } from "@/lib/db";

const requestSchema = z.object({ token: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("ACCESS_DENIED", 403);
  const share = await activePageShare(parsed.data.token);
  if (!share) return apiErrorResponse("ACCESS_DENIED", 403);

  const secret = process.env.COLLAB_SECRET;
  if (!secret || secret.length < 32) return apiErrorResponse("COLLABORATION_NOT_CONFIGURED", 500);
  const language = resolveCollaborationLanguage(share.page.createdBy.language, share.page.createdBy.language);
  const initialization = initialCollaborationDocumentUpsert(share.page.id, share.page.format, language);
  await db.$transaction(async (transaction) => {
    await transaction.collabDocument.upsert({
      ...initialization,
      create: { ...initialization.create, data: Buffer.from(initialization.create.data) },
    });
    const documents = await transaction.$queryRaw<{ data: Uint8Array }[]>`
      SELECT "data" FROM "CollabDocument" WHERE "name" = ${initialization.where.name} FOR UPDATE
    `;
    const document = documents[0];
    if (!document) throw new Error("Collaboration document initialization failed.");
    if (!collaborationStateNeedsInitialization(document.data)) return;
    await transaction.collabDocument.update({
      where: initialization.where,
      data: { data: Buffer.from(initialization.create.data) },
    });
  });

  const readOnly = pageShareIsReadOnly(share.permission);
  const name = readOnly ? "Shared viewer" : "Shared editor";
  const token = await new SignJWT({
    pageId: share.page.id,
    shareId: share.id,
    name,
    readOnly,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject(`share:${share.id}`)
    .setIssuedAt()
    .setExpirationTime("6m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({
    token,
    readOnly,
    user: { id: `share:${share.id}`, name },
  }, { headers: { "Cache-Control": "no-store" } });
}
