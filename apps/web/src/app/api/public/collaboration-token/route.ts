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
import { activeFolderSharePage } from "@/lib/folder-share-server";

const requestSchema = z.object({
  token: z.string().min(1).max(128),
  kind: z.enum(["page", "folder"]).default("page"),
  pageId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("ACCESS_DENIED", 403);
  const pageShare = parsed.data.kind === "page" ? await activePageShare(parsed.data.token) : null;
  const folderAccess = parsed.data.kind === "folder" && parsed.data.pageId
    ? await activeFolderSharePage(parsed.data.token, parsed.data.pageId)
    : null;
  if (!pageShare && !folderAccess) return apiErrorResponse("ACCESS_DENIED", 403);
  const page = pageShare?.page ?? folderAccess!.page;
  const permission = pageShare?.permission ?? folderAccess!.share.permission;
  const shareId = pageShare?.id ?? folderAccess!.share.id;
  if (page.format === "PDF") return apiErrorResponse("ACCESS_DENIED", 403);

  const secret = process.env.COLLAB_SECRET;
  if (!secret || secret.length < 32) return apiErrorResponse("COLLABORATION_NOT_CONFIGURED", 500);
  const language = resolveCollaborationLanguage(page.createdBy.language, page.createdBy.language);
  const initialization = initialCollaborationDocumentUpsert(page.id, page.format, language);
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

  const readOnly = pageShareIsReadOnly(permission);
  const name = readOnly ? "Shared viewer" : "Shared editor";
  const token = await new SignJWT({
    pageId: page.id,
    ...(pageShare ? { shareId } : { folderShareId: shareId }),
    name,
    readOnly,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject(`${pageShare ? "share" : "folder-share"}:${shareId}`)
    .setIssuedAt()
    .setExpirationTime("6m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({
    token,
    readOnly,
    user: { id: `${pageShare ? "share" : "folder-share"}:${shareId}`, name },
  }, { headers: { "Cache-Control": "no-store" } });
}
