import { db } from "@/lib/db";
import { apiErrorResponse } from "@/lib/api-errors";
import { activePageShare } from "@/lib/page-share-server";
import { safeDownloadName } from "@/lib/page-file";
import { filePreviewKind } from "@/lib/file-preview";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await activePageShare(token);
  if (!share || share.page.format !== "FILE") return apiErrorResponse("FILE_NOT_FOUND", 404);
  const page = await db.page.findUnique({
    where: { id: share.page.id },
    select: { title: true, fileData: true, fileMime: true },
  });
  if (!page?.fileData) return apiErrorResponse("FILE_NOT_FOUND", 404);
  const name = safeDownloadName(page.title);
  const preview = new URL(request.url).searchParams.get("preview") === "1" && filePreviewKind(page.fileMime);
  return new Response(page.fileData, {
    headers: {
      "Content-Type": page.fileMime || "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(preview ? { "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } : {}),
    },
  });
}
