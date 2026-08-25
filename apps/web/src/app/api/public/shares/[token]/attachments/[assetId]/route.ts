import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { fileContentDisposition } from "@/lib/file-response";
import { activePageShare } from "@/lib/page-share-server";

export async function GET(request: Request, context: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await context.params;
  const share = await activePageShare(token);
  if (!share) return apiErrorResponse("ACCESS_DENIED", 404);
  const asset = await db.pageAsset.findFirst({
    where: { id: assetId, pageId: share.pageId, kind: "ATTACHMENT" },
    select: { data: true, mime: true, name: true },
  });
  if (!asset) return apiErrorResponse("ACCESS_DENIED", 404);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(asset.data, {
    headers: {
      "Content-Type": asset.mime,
      "Content-Disposition": fileContentDisposition(asset.name, download ? "attachment" : "inline"),
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
