import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { calendarEntrySchema } from "@/lib/calendar";
import { normalizeCalendarEntry } from "@/lib/calendar-recurrence";
import { calendarEntryData, calendarEntryDto } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const parsed = calendarEntrySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);
  const entry = await db.calendarEntry.create({ data: { userId: user.id, ...calendarEntryData(normalizeCalendarEntry(parsed.data)) } });
  return Response.json({ entry: calendarEntryDto(entry) }, { status: 201 });
}
