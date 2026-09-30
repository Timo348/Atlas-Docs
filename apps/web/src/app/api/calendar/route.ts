import { Temporal } from "temporal-polyfill";
import type { Prisma } from "@prisma/client";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { calendarRange, isCalendarDate, type CalendarQueryResult } from "@/lib/calendar";
import { calendarAnchor, expandCalendarEntry } from "@/lib/calendar-recurrence";
import { indexedCalendarEvent, loadCalendarPreferences, loadCalendarSpaces } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const params = new URL(request.url).searchParams;
  const range = calendarRange(params.get("start"), params.get("end"));
  if (!range) return apiErrorResponse("INVALID_INPUT", 400);
  const spaces = await loadCalendarSpaces(user.id);
  const { preferences } = await loadCalendarPreferences(user.id, spaces.map((space) => space.id));
  const selected = params.has("spaces") ? (params.get("spaces") || "").split(",").filter(Boolean) : preferences.selectedSpaceIds;
  if (selected.some((id) => !spaces.some((space) => space.id === id))) return apiErrorResponse("ACCESS_DENIED", 403);
  const scope = params.get("scope") || preferences.taskScope;
  const completed = params.has("completed") ? params.get("completed") === "true" : preferences.showCompleted;
  const today = params.get("today") || Temporal.Now.plainDateISO(preferences.timeZone).toString();
  if (!isCalendarDate(today) || (scope !== "all" && scope !== "mine") || (params.has("completed") && !["true", "false"].includes(params.get("completed")!))) return apiErrorResponse("INVALID_INPUT", 400);
  const base: Prisma.TodoTaskIndexWhereInput = { spaceId: { in: selected }, page: { todoIndexState: "INDEXED" },
    ...(scope === "mine" ? { assigneeIds: { has: user.id } } : {}), ...(!completed ? { column: { not: "COMPLETED" } } : {}) };
  const [dated, undated, overdue, personal, warnings] = await Promise.all([
    db.todoTaskIndex.findMany({ where: { ...base, deadline: { gte: range.start, lt: range.end } }, orderBy: [{ deadline: "asc" }, { taskId: "asc" }], take: 5001 }),
    db.todoTaskIndex.findMany({ where: { ...base, deadline: null }, orderBy: { title: "asc" }, take: 1001 }),
    db.todoTaskIndex.findMany({ where: { ...base, column: { not: "COMPLETED" }, deadline: { lt: today } }, orderBy: [{ deadline: "desc" }, { taskId: "asc" }], take: 1001 }),
    db.calendarEntry.findMany({ where: { userId: user.id }, include: { exceptions: { where: { userId: user.id } } }, take: 5001 }),
    db.page.findMany({ where: { spaceId: { in: selected }, format: "TODO", todoIndexState: { not: "INDEXED" } }, select: { id: true, title: true, todoIndexState: true } }),
  ]);
  if (dated.length > 5000 || personal.length > 5000) return apiErrorResponse("CALENDAR_RANGE_LIMIT", 422);
  const roles = new Map(spaces.map((space) => [space.id, space.role]));
  const result: CalendarQueryResult = {
    spaces, preferences, events: dated.map((task) => indexedCalendarEvent(task, roles.get(task.spaceId)!)),
    undated: undated.slice(0, 1000).map((task) => indexedCalendarEvent(task, roles.get(task.spaceId)!)),
    overdue: overdue.slice(0, 1000).map((task) => indexedCalendarEvent(task, roles.get(task.spaceId)!)), overdueTruncated: overdue.length > 1000, undatedTruncated: undated.length > 1000,
    indexWarnings: warnings.map((page) => ({ pageId: page.id, title: page.title, status: page.todoIndexState })),
  };
  try {
    const overdueStart = Temporal.PlainDate.from(today).subtract({ days: 366 }).toString();
    for (const entry of personal) {
      const anchor = calendarAnchor(entry);
      const events = expandCalendarEntry(entry, entry.exceptions, range.start, range.end, 5000, preferences.timeZone);
      if (!anchor) { result.undated.push(...events.filter((event) => completed || !event.completed)); continue; }
      result.events.push(...events.filter((event) => completed || !event.completed));
      if (entry.kind === "todo") {
        const overdueEvents = expandCalendarEntry(entry, entry.exceptions, entry.recurrence ? overdueStart : "0001-01-01", today)
          .filter((event) => !event.completed && event.start && event.start < today);
        result.overdue.push(...overdueEvents);
        if (entry.recurrence && anchor < overdueStart) result.overdueTruncated = true;
      }
      if (result.events.length > 5000) throw new RangeError("Too many calendar events");
    }
  } catch (error) {
    if (error instanceof RangeError) return apiErrorResponse("CALENDAR_RANGE_LIMIT", 422);
    throw error;
  }
  result.events.sort((a, b) => (a.start || "").localeCompare(b.start || "") || a.title.localeCompare(b.title));
  result.overdue.sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  if (result.overdue.length > 1000) { result.overdue = result.overdue.slice(0, 1000); result.overdueTruncated = true; }
  if (result.undated.length > 1000) { result.undated = result.undated.slice(0, 1000); result.undatedTruncated = true; }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
