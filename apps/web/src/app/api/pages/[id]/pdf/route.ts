import { NextResponse } from "next/server";
import { pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { fileContentDisposition } from "@/lib/file-response";
import { apiErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { id: pageId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || page.format !== "PDF") return apiErrorResponse("ACCESS_DENIED", 404);
  const document = await db.pageAsset.findFirst({
    where: { pageId, kind: "DOCUMENT" },
    orderBy: { createdAt: "desc" },
    select: { data: true, name: true, mime: true },
  });
  if (!document) return apiErrorResponse("ACCESS_DENIED", 404);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(document.data, {
    headers: {
      "Content-Type": document.mime,
      "Content-Disposition": fileContentDisposition(document.name, download ? "attachment" : "inline"),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
