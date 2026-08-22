import { pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { safeDownloadName } from "@/lib/page-file";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page) return apiErrorResponse("ACCESS_DENIED", 403);
  if (page.format !== "FILE" || !page.fileData) return apiErrorResponse("FILE_NOT_FOUND", 404);
  const name = safeDownloadName(page.title);
  return new Response(page.fileData, {
    headers: {
      "Content-Type": page.fileMime || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
