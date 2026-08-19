import { NextResponse } from "next/server";
import { pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { fileContentDisposition } from "@/lib/file-response";
import { apiErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id: pageId, assetId } = await context.params;
  if (!await pageAccess(user.id, pageId)) return apiErrorResponse("ACCESS_DENIED", 404);
  const asset = await db.pageAsset.findFirst({
    where: { id: assetId, pageId, kind: "ATTACHMENT" },
    select: { data: true, mime: true, name: true },
  });
  if (!asset) return apiErrorResponse("ACCESS_DENIED", 404);
  return fileResponse(request, asset);
}

function fileResponse(request: Request, asset: { data: Uint8Array; mime: string; name: string }) {
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(Buffer.from(asset.data), {
    headers: {
      "Content-Type": asset.mime,
      "Content-Disposition": fileContentDisposition(asset.name, download ? "attachment" : "inline"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
