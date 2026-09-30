import { Temporal } from "temporal-polyfill";
import { z } from "zod";
import type { TodoTask } from "@/lib/todo-board";

export const CALENDAR_VIEWS = ["dayGridMonth", "timeGridWeek", "timeGridDay", "listMonth"] as const;
export type CalendarView = typeof CALENDAR_VIEWS[number];
export type CalendarRecurrence = { frequency: "daily" | "weekly" | "monthly" | "yearly"; interval: number; count?: number; until?: string };
export type CalendarPreferences = { view: CalendarView; selectedSpaceIds: string[]; knownSpaceIds: string[]; taskScope: "all" | "mine"; showCompleted: boolean; timeZone: string };
export type CalendarSpace = { id: string; name: string; slug: string; role: "OWNER" | "EDITOR" | "VIEWER" };
export type CalendarEvent = {
  id: string; source: "personal" | "space"; kind: "appointment" | "todo"; title: string; description: string;
  location?: string | null; start: string | null; end: string | null; allDay: boolean; completed: boolean;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW"; timeZone?: string; recurrence?: CalendarRecurrence | null;
  revision: number | string; canEdit: boolean; entryId?: string; occurrenceKey?: string;
  spaceId?: string; pageId?: string; taskId?: string; assigneeIds?: string[]; task?: TodoTask; boardUrl?: string;
  /** Original local values for editing without losing the appointment's time zone. */
  entry?: CalendarEntryInput;
};
export type CalendarQueryResult = { events: CalendarEvent[]; undated: CalendarEvent[]; overdue: CalendarEvent[]; overdueTruncated: boolean; undatedTruncated: boolean; spaces: CalendarSpace[]; preferences: CalendarPreferences; indexWarnings: { pageId: string; title: string; status: string }[] };

export function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
}
export function isCalendarLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return false;
  try { Temporal.PlainDateTime.from(value); return true; } catch { return false; }
}
export function isCalendarTimeZone(value: string) {
  try { Temporal.Now.zonedDateTimeISO(value); return !/^[+-]/.test(value); } catch { return false; }
}
const date = z.string().refine(isCalendarDate);
const local = z.string().refine((value) => isCalendarDate(value) || isCalendarLocalDateTime(value));
export const calendarRecurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]), interval: z.number().int().min(1).max(100).default(1),
  count: z.number().int().min(1).max(10000).optional(), until: date.optional(),
}).strict().refine((rule) => !(rule.count && rule.until), "Choose a count or an end date.");
export const calendarEntryFieldsSchema = z.object({
  kind: z.enum(["appointment", "todo"]), title: z.string().trim().min(1).max(240),
  description: z.string().max(12000).default(""), location: z.string().max(500).nullable().optional(),
  allDay: z.boolean().default(false), start: local.nullable().optional(), end: local.nullable().optional(),
  dueDate: date.nullable().optional(), timeZone: z.string().refine(isCalendarTimeZone).default("Europe/Berlin"),
  completed: z.boolean().default(false), priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  recurrence: calendarRecurrenceSchema.nullable().optional(),
}).strict();
export const calendarEntrySchema = calendarEntryFieldsSchema.superRefine((entry, context) => {
  if (entry.kind === "appointment") {
    const validStart = entry.start && (entry.allDay ? isCalendarDate(entry.start) : isCalendarLocalDateTime(entry.start));
    const validEnd = entry.end && (entry.allDay ? isCalendarDate(entry.end) : isCalendarLocalDateTime(entry.end));
    if (!validStart || !validEnd || entry.end! <= entry.start!) context.addIssue({ code: "custom", message: "An appointment requires a valid start and a later end." });
    if (validStart && validEnd) {
      const days = entry.allDay
        ? Temporal.PlainDate.from(entry.start!).until(Temporal.PlainDate.from(entry.end!)).days
        : Temporal.PlainDateTime.from(entry.start!).until(Temporal.PlainDateTime.from(entry.end!), { largestUnit: "days" }).days;
      if (days > 31) context.addIssue({ code: "custom", message: "An appointment may span at most 31 days." });
      if (!entry.allDay && isCalendarTimeZone(entry.timeZone)) {
        const start = Temporal.PlainDateTime.from(entry.start!).toZonedDateTime(entry.timeZone, { disambiguation: "compatible" });
        const end = Temporal.PlainDateTime.from(entry.end!).toZonedDateTime(entry.timeZone, { disambiguation: "compatible" });
        if (Temporal.ZonedDateTime.compare(end, start) <= 0) context.addIssue({ code: "custom", message: "The appointment end must follow its start in the selected time zone." });
      }
    }
  } else if (entry.recurrence && !entry.dueDate) context.addIssue({ code: "custom", message: "A recurring todo requires a due date." });
  const firstDate = (entry.kind === "todo" ? entry.dueDate : entry.start)?.slice(0, 10);
  if (entry.recurrence?.until && firstDate && entry.recurrence.until < firstDate) context.addIssue({ code: "custom", message: "The recurrence end cannot precede its start." });
});
export type CalendarEntryInput = z.infer<typeof calendarEntrySchema>;
export const calendarMutationSchema = calendarEntryFieldsSchema.partial().extend({
  scope: z.enum(["occurrence", "following"]).default("occurrence"), occurrenceKey: local.optional(), revision: z.number().int().positive(),
}).strict();
export const calendarPreferencesSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional(), selectedSpaceIds: z.array(z.string().min(1)).max(1000).optional(),
  taskScope: z.enum(["all", "mine"]).optional(), showCompleted: z.boolean().optional(), timeZone: z.string().refine(isCalendarTimeZone).optional(),
}).strict();
export function normalizeCalendarPreferences(saved: Partial<CalendarPreferences> | null, spaceIds: string[]): CalendarPreferences {
  const known = new Set(saved?.knownSpaceIds || []);
  const selected = new Set(saved?.selectedSpaceIds || []);
  return {
    view: saved?.view && (CALENDAR_VIEWS as readonly string[]).includes(saved.view) ? saved.view : "dayGridMonth",
    selectedSpaceIds: spaceIds.filter((id) => !known.has(id) || selected.has(id)), knownSpaceIds: spaceIds,
    taskScope: saved?.taskScope === "mine" ? "mine" : "all", showCompleted: saved?.showCompleted === true,
    timeZone: saved?.timeZone && isCalendarTimeZone(saved.timeZone) ? saved.timeZone : "Europe/Berlin",
  };
}
export function calendarRange(start: string | null, end: string | null) {
  if (!start || !end || !isCalendarDate(start) || !isCalendarDate(end)) return null;
  const days = Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days;
  return days > 0 && days <= 366 ? { start, end } : null;
}
