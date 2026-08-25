import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { fileContentDisposition } from "@/lib/file-response";
import { activeFolderSharePage } from "@/lib/folder-share-server";

export async function GET(request: Request, context: { params: Promise<{ token: string; pageId: string }> }) {
  const { token, pageId } = await context.params;
  const access = await activeFolderSharePage(token, pageId);
  if (!access || access.page.format !== "FILE" || !access.page.fileData) return apiErrorResponse("ACCESS_DENIED", 404);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(access.page.fileData, {
    headers: {
      "Content-Type": access.page.fileMime || "application/octet-stream",
      "Content-Disposition": fileContentDisposition(access.page.title, download ? "attachment" : "inline"),
      "Cache-Control": "private, max-age=300",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
