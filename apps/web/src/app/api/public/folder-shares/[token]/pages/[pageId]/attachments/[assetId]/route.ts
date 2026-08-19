import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { fileContentDisposition } from "@/lib/file-response";
import { activeFolderSharePage } from "@/lib/folder-share-server";

export async function GET(request: Request, context: { params: Promise<{ token: string; pageId: string; assetId: string }> }) {
  const { token, pageId, assetId } = await context.params;
  if (!await activeFolderSharePage(token, pageId)) return apiErrorResponse("ACCESS_DENIED", 404);
  const asset = await db.pageAsset.findFirst({
    where: { id: assetId, pageId, kind: "ATTACHMENT" },
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
