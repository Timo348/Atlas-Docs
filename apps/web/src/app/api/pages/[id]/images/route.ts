import { NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse, isCodedApiError } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { readValidatedImage } from "@/lib/image-upload";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id: pageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || !canEdit(page.accessRole)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", page ? 403 : 404);
  }

  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return apiErrorResponse("IMAGE_MISSING", 400);
    const image = await readValidatedImage(file);
    const stored = await db.pageImage.create({
      data: {
        pageId,
        createdById: user.id,
        mime: image.mime,
        size: image.bytes.byteLength,
        data: Buffer.from(image.bytes),
      },
      select: { id: true, mime: true, size: true },
    });
    return NextResponse.json({
      ...stored,
      url: `/api/pages/${pageId}/images/${stored.id}`,
    }, { status: 201 });
  } catch (error) {
    if (isCodedApiError(error)) return apiErrorResponse(error.code, 400);
    console.error("[atlas-api] Page image save failed.", error);
    return apiErrorResponse("IMAGE_SAVE_FAILED", 500);
  }
}
