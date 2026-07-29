import { NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string; imageId: string }> };

export async function GET(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id: pageId, imageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page) return new NextResponse(null, { status: 404 });
  const image = await db.pageImage.findFirst({
    where: { id: imageId, pageId },
    select: { data: true, mime: true },
  });
  if (!image) return new NextResponse(null, { status: 404 });
  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id: pageId, imageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || !canEdit(page.accessRole)) {
    return apiErrorResponse("WRITE_ACCESS_REQUIRED", page ? 403 : 404);
  }
  const deleted = await db.pageImage.deleteMany({ where: { id: imageId, pageId } });
  return new NextResponse(null, { status: deleted.count ? 204 : 404 });
}
