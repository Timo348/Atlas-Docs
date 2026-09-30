import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canEdit } from "@/lib/access";
import { strongestSpaceRole } from "@/lib/space-role";
import { normalizeCalendarPreferences, type CalendarEntryInput, type CalendarEvent, type CalendarPreferences, type CalendarSpace } from "@/lib/calendar";
import type { CalendarRecord } from "@/lib/calendar-recurrence";

/** Shared fresh access predicate: administrator status never grants calendar access. */
export function calendarSpaceWhere(userId: string, now = new Date()): Prisma.SpaceWhereInput {
  return { OR: [
    { memberships: { some: { userId } } },
    { teamAccess: { some: { team: { members: { some: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } } } },
  ] };
}
export async function loadCalendarSpaces(userId: string): Promise<CalendarSpace[]> {
  const now = new Date();
  const rows = await db.space.findMany({
    where: calendarSpaceWhere(userId, now), orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true, name: true, slug: true, memberships: { where: { userId }, select: { role: true } },
      teamAccess: { where: { team: { members: { some: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } } }, select: { role: true } },
    },
  });
  return rows.map(({ memberships, teamAccess, ...space }) => ({ ...space, role: strongestSpaceRole([...memberships.map((m) => m.role), ...teamAccess.map((t) => t.role)])! }));
}
export async function loadCalendarPreferences(userId: string, spaceIds: string[]) {
  const stored = await db.calendarPreference.findUnique({ where: { userId } });
  const preferences = normalizeCalendarPreferences(stored as Partial<CalendarPreferences> | null, spaceIds);
  return { preferences, saved: Boolean(stored) };
}
export async function loadAssignableSpaceMembers(spaceId: string, client: Pick<Prisma.TransactionClient, "user"> = db) {
  const now = new Date();
  return client.user.findMany({ where: { active: true, OR: [
    { memberships: { some: { spaceId } } },
    { teamMemberships: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], team: { spaces: { some: { spaceId } } } } } },
  ] }, select: { id: true, name: true, email: true }, orderBy: [{ name: "asc" }, { email: "asc" }] });
}
export function calendarEntryData(input: CalendarEntryInput) {
  return { ...input, location: input.location || null, start: input.start || null, end: input.end || null, dueDate: input.dueDate || null, recurrence: input.recurrence ? input.recurrence as Prisma.InputJsonValue : Prisma.DbNull };
}
export function calendarEntryDto(entry: CalendarRecord) {
  return { id: entry.id, revision: entry.revision, kind: entry.kind, title: entry.title, description: entry.description,
    location: entry.location, allDay: entry.allDay, start: entry.start, end: entry.end, dueDate: entry.dueDate,
    timeZone: entry.timeZone, completed: entry.completed, priority: entry.priority, recurrence: entry.recurrence,
  };
}
export type IndexedCalendarTask = {
  pageId: string; taskId: string; spaceId: string; title: string; description: string; column: string; priority: string;
  deadline: string | null; blockedBy: string[]; assigneeIds: string[]; createdAt: bigint; updatedAt: bigint; stateHash: string;
};
export function indexedCalendarTask(row: IndexedCalendarTask) {
  return { id: row.taskId, title: row.title, description: row.description, column: row.column as "NEW" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED",
    priority: row.priority as "URGENT" | "HIGH" | "MEDIUM" | "LOW", deadline: row.deadline, blockedBy: row.blockedBy,
    assigneeIds: row.assigneeIds, createdAt: Number(row.createdAt), updatedAt: Number(row.updatedAt) };
}
export function indexedCalendarEvent(row: IndexedCalendarTask, role: string): CalendarEvent {
  const task = indexedCalendarTask(row);
  return { id: `space:${row.pageId}:${row.taskId}`, source: "space", kind: "todo", title: row.title, description: row.description,
    start: row.deadline, end: null, allDay: true, completed: row.column === "COMPLETED", priority: task.priority,
    revision: row.stateHash, spaceId: row.spaceId, pageId: row.pageId, taskId: row.taskId, assigneeIds: row.assigneeIds,
    task, canEdit: canEdit(role), boardUrl: `/?space=${encodeURIComponent(row.spaceId)}&page=${encodeURIComponent(row.pageId)}&task=${encodeURIComponent(row.taskId)}` };
}
export async function personalCalendarExport(userId: string) {
  // Scope always comes from the session, including administrator exports.
  const [entries, exceptions, preferences] = await Promise.all([
    db.calendarEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.calendarException.findMany({ where: { userId, entry: { userId } }, orderBy: { occurrenceKey: "asc" } }),
    db.calendarPreference.findUnique({ where: { userId } }),
  ]);
  return { format: "atlas-personal-calendar", version: 1, exportedAt: new Date().toISOString(), entries, exceptions, preferences };
}
