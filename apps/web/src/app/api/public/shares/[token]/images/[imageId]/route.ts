import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activePageShare } from "@/lib/page-share-server";
import { apiErrorResponse } from "@/lib/api-errors";

export async function GET(
  _: Request,
  context: { params: Promise<{ token: string; imageId: string }> },
) {
  const { token, imageId } = await context.params;
  const share = await activePageShare(token);
  if (!share) return apiErrorResponse("ACCESS_DENIED", 404);
  const image = await db.pageImage.findFirst({
    where: { id: imageId, pageId: share.pageId },
    select: { data: true, mime: true },
  });
  if (!image) return apiErrorResponse("ACCESS_DENIED", 404);
  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
