import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { fileContentDisposition } from "@/lib/file-response";
import { activeFolderSharePage } from "@/lib/folder-share-server";

export async function GET(request: Request, context: { params: Promise<{ token: string; pageId: string }> }) {
  const { token, pageId } = await context.params;
  const access = await activeFolderSharePage(token, pageId);
  if (!access || access.page.format !== "PDF") return apiErrorResponse("ACCESS_DENIED", 404);
  const document = await db.pageAsset.findFirst({
    where: { pageId, kind: "DOCUMENT" },
    orderBy: { createdAt: "desc" },
    select: { data: true, mime: true, name: true },
  });
  if (!document) return apiErrorResponse("ACCESS_DENIED", 404);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(document.data, {
    headers: {
      "Content-Type": document.mime,
      "Content-Disposition": fileContentDisposition(document.name, download ? "attachment" : "inline"),
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
