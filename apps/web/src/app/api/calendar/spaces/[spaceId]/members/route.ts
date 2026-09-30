import { canEdit, requireApiUser, spaceAccess } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { loadAssignableSpaceMembers } from "@/lib/calendar-server";

export const dynamic = "force-dynamic";
export async function GET(_: Request, context: { params: Promise<{ spaceId: string }> }) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { spaceId } = await context.params;
  const role = await spaceAccess(user.id, spaceId);
  if (!role) return apiErrorResponse("ACCESS_DENIED", 403);
  const members = await loadAssignableSpaceMembers(spaceId);
  return Response.json({ members, canEdit: canEdit(role) }, { headers: { "Cache-Control": "no-store" } });
}
