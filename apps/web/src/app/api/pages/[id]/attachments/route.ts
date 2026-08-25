import { NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse, isCodedApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { readValidatedPdf } from "@/lib/file-import";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id: pageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || !canEdit(page.accessRole)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", page ? 403 : 404);
  }
  if (page.format !== "MARKDOWN") return apiErrorResponse("FILE_INVALID_TYPE", 400);

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiErrorResponse("FILE_MISSING", 400);
    const pdf = await readValidatedPdf(file);
    const stored = await db.pageAsset.create({
      data: {
        pageId,
        createdById: user.id,
        kind: "ATTACHMENT",
        name: pdf.name,
        mime: pdf.mime,
        size: pdf.bytes.byteLength,
        data: Buffer.from(pdf.bytes),
      },
      select: { id: true, name: true, size: true },
    });
    return NextResponse.json({
      ...stored,
      url: `/api/pages/${pageId}/attachments/${stored.id}`,
    }, { status: 201 });
  } catch (error) {
    if (isCodedApiError(error)) return apiErrorResponse(error.code, 400);
    console.error("[atlas-api] PDF attachment save failed.", error);
    return apiErrorResponse("FILE_SAVE_FAILED", 500);
  }
}
