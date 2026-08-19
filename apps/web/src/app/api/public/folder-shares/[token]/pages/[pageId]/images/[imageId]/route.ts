import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { activeFolderSharePage } from "@/lib/folder-share-server";

export async function GET(_: Request, context: { params: Promise<{ token: string; pageId: string; imageId: string }> }) {
  const { token, pageId, imageId } = await context.params;
  if (!await activeFolderSharePage(token, pageId)) return apiErrorResponse("ACCESS_DENIED", 404);
  const image = await db.pageImage.findFirst({
    where: { id: imageId, pageId },
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
