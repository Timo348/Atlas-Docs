import { canEdit, pageAccess, requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { indexedCalendarTask } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ pageId: string; taskId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { pageId, taskId } = await context.params;
  const page = await pageAccess(user.id, pageId);
  if (!page || page.format !== "TODO") return apiErrorResponse("ACCESS_DENIED", 403);
  if (page.todoIndexState !== "INDEXED") return Response.json({ task: null, revision: null, indexState: page.todoIndexState, canEdit: canEdit(page.accessRole) }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const indexed = await db.todoTaskIndex.findUnique({ where: { pageId_taskId: { pageId, taskId } } });
  if (!indexed) return Response.json({ task: null, revision: null, indexState: page.todoIndexState, canEdit: canEdit(page.accessRole) }, { status: page.todoIndexState === "INDEXED" ? 404 : 409, headers: { "Cache-Control": "no-store" } });
  return Response.json({ task: indexedCalendarTask(indexed), revision: indexed.stateHash, indexState: page.todoIndexState, canEdit: canEdit(page.accessRole),
    boardUrl: `/?space=${encodeURIComponent(page.spaceId)}&page=${encodeURIComponent(pageId)}&task=${encodeURIComponent(taskId)}`,
  }, { headers: { "Cache-Control": "no-store" } });
}
