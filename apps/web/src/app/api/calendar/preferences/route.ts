import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { calendarPreferencesSchema } from "@/lib/calendar";
import { loadCalendarPreferences, loadCalendarSpaces } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const spaces = await loadCalendarSpaces(user.id);
  return Response.json(await loadCalendarPreferences(user.id, spaces.map((space) => space.id)), { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const parsed = calendarPreferencesSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PREFERENCES_INVALID", 400);
  const spaceIds = (await loadCalendarSpaces(user.id)).map((space) => space.id);
  if (parsed.data.selectedSpaceIds?.some((id) => !spaceIds.includes(id))) return apiErrorResponse("ACCESS_DENIED", 403);
  const { preferences: existing } = await loadCalendarPreferences(user.id, spaceIds);
  const preferences = { ...existing, ...parsed.data, knownSpaceIds: spaceIds, selectedSpaceIds: Array.from(new Set(parsed.data.selectedSpaceIds || existing.selectedSpaceIds)) };
  await db.calendarPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, ...preferences }, update: preferences });
  return Response.json({ preferences, saved: true });
}
