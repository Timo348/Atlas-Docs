import { Temporal } from "temporal-polyfill";
import { RRule } from "rrule";
import { calendarEntrySchema, type CalendarEntryInput, type CalendarEvent, type CalendarRecurrence } from "./calendar";

export type CalendarRecord = {
  id: string; userId: string; kind: string; title: string; description: string; location: string | null;
  allDay: boolean; start: string | null; end: string | null; dueDate: string | null; timeZone: string;
  completed: boolean; priority: string; recurrence: unknown; recurrenceUntil: string | null; revision: number;
};
export type CalendarExceptionRecord = { occurrenceKey: string; cancelled: boolean; patch: unknown };
const frequencies = { daily: RRule.DAILY, weekly: RRule.WEEKLY, monthly: RRule.MONTHLY, yearly: RRule.YEARLY };

/** RRule runs on floating UTC dates; Temporal applies the entry's zone afterwards. */
function floating(value: string) { return new Date(`${value.length === 10 ? `${value}T00:00:00` : value}Z`); }
function localKey(value: Date, dateOnly: boolean) { return value.toISOString().slice(0, dateOnly ? 10 : 19); }
export function normalizeCalendarEntry(input: CalendarEntryInput): CalendarEntryInput {
  return {
    ...input, location: input.location || null,
    start: input.kind === "appointment" && input.start ? (input.allDay ? input.start : Temporal.PlainDateTime.from(input.start).toString({ smallestUnit: "second" })) : null,
    end: input.kind === "appointment" && input.end ? (input.allDay ? input.end : Temporal.PlainDateTime.from(input.end).toString({ smallestUnit: "second" })) : null,
    dueDate: input.kind === "todo" ? input.dueDate || null : null, allDay: input.kind === "todo" || input.allDay,
    completed: input.kind === "todo" && !input.recurrence ? input.completed : false, recurrence: input.recurrence || null,
  };
}
export function calendarRecordInput(entry: CalendarRecord): CalendarEntryInput {
  return calendarEntrySchema.parse({
    kind: entry.kind, title: entry.title, description: entry.description, location: entry.location,
    allDay: entry.allDay, start: entry.start, end: entry.end, dueDate: entry.dueDate,
    timeZone: entry.timeZone, completed: entry.completed, priority: entry.priority, recurrence: entry.recurrence,
  });
}
export function calendarAnchor(entry: CalendarRecord | CalendarEntryInput) { return entry.kind === "todo" ? entry.dueDate || null : entry.start || null; }
export function calendarRule(entry: CalendarRecord) {
  const input = calendarRecordInput(entry);
  const anchor = calendarAnchor(input);
  if (!input.recurrence || !anchor) return null;
  return new RRule({
    freq: frequencies[input.recurrence.frequency], interval: input.recurrence.interval, dtstart: floating(anchor),
    ...(input.recurrence.count ? { count: input.recurrence.count } : {}),
    ...(input.recurrence.until ? { until: floating(`${input.recurrence.until}T23:59:59`) } : {}),
  });
}
export function isCalendarOccurrence(entry: CalendarRecord, key: string) {
  const anchor = calendarAnchor(entry);
  if (!anchor || (entry.recurrenceUntil && key >= entry.recurrenceUntil)) return false;
  if (!entry.recurrence) return key === anchor;
  if ((anchor.length === 10) !== (key.length === 10)) return false;
  const target = floating(key);
  if (!Number.isFinite(target.valueOf())) return false;
  const occurrence = calendarRule(entry)?.before(target, true);
  return occurrence?.valueOf() === target.valueOf();
}
export function previousCalendarOccurrence(entry: CalendarRecord, key: string) {
  const previous = calendarRule(entry)?.before(floating(key), false);
  return previous ? localKey(previous, calendarAnchor(entry)!.length === 10) : null;
}
export function calendarOccurrenceInput(entry: CalendarRecord, key: string): CalendarEntryInput {
  const input = calendarRecordInput(entry);
  if (input.kind === "todo") return { ...input, dueDate: key, completed: entry.recurrence ? false : entry.completed };
  if (input.allDay) {
    const duration = Temporal.PlainDate.from(input.start!).until(Temporal.PlainDate.from(input.end!));
    return { ...input, start: key, end: Temporal.PlainDate.from(key).add(duration).toString() };
  }
  const duration = Temporal.PlainDateTime.from(input.start!).until(Temporal.PlainDateTime.from(input.end!));
  let end = Temporal.PlainDateTime.from(key).add(duration);
  const zonedStart = Temporal.PlainDateTime.from(key).toZonedDateTime(input.timeZone, { disambiguation: "compatible" });
  const zonedEnd = end.toZonedDateTime(input.timeZone, { disambiguation: "compatible" });
  if (Temporal.ZonedDateTime.compare(zonedEnd, zonedStart) <= 0) {
    // A recurrence can land in a spring clock gap. Keep its wall duration from
    // the compatibly resolved start instead of creating a negative event.
    const wallMilliseconds = floating(input.end!).valueOf() - floating(input.start!).valueOf();
    end = zonedStart.add({ milliseconds: wallMilliseconds }).toPlainDateTime();
  }
  return { ...input, start: key, end: end.toString({ smallestUnit: "second" }) };
}
export function remainingCalendarRecurrence(entry: CalendarRecord, key: string): CalendarRecurrence | null {
  const recurrence = calendarRecordInput(entry).recurrence;
  if (!recurrence) return null;
  if (!recurrence.count) return recurrence;
  const before = calendarRule(entry)!.between(floating(calendarAnchor(entry)!), floating(key), true).length - 1;
  return { ...recurrence, count: Math.max(1, recurrence.count - before) };
}
function eventFromInput(entry: CalendarRecord, key: string, input: CalendarEntryInput): CalendarEvent {
  const timed = input.kind === "appointment" && !input.allDay;
  const convert = (value: string | null | undefined) => value ? (timed ? Temporal.PlainDateTime.from(value).toZonedDateTime(input.timeZone, { disambiguation: "compatible" }).toInstant().toString() : value) : null;
  return {
    id: `personal:${entry.id}:${key}`, source: "personal", entryId: entry.id, occurrenceKey: key,
    kind: input.kind, title: input.title, description: input.description, location: input.location,
    start: convert(input.kind === "todo" ? input.dueDate : input.start), end: convert(input.end),
    allDay: input.kind === "todo" || input.allDay, completed: input.completed, priority: input.priority,
    timeZone: input.timeZone, recurrence: input.recurrence, revision: entry.revision, canEdit: true, entry: input,
  };
}
/** Expansion is restricted to the requested dates, with a hard output limit. */
export function expandCalendarEntry(entry: CalendarRecord, exceptions: CalendarExceptionRecord[], start: string, end: string, limit = 5000, rangeTimeZone = entry.timeZone): CalendarEvent[] {
  const anchor = calendarAnchor(entry);
  if (!anchor) return [eventFromInput(entry, "undated", calendarRecordInput(entry))];
  const keys = new Set<string>();
  if (!entry.recurrence) keys.add(anchor);
  else {
    // A multi-day appointment starting before the range can still overlap it.
    const from = Temporal.PlainDate.from(start).subtract({ days: 33 }).toString();
    const to = Temporal.PlainDate.from(end).add({ days: 2 }).toString();
    calendarRule(entry)!.between(floating(from), floating(`${to}T00:00:00`), true, (value, index) => {
      if (index >= limit + 36) throw new RangeError("Calendar range has too many occurrences.");
      keys.add(localKey(value, anchor.length === 10));
      return true;
    });
  }
  const byKey = new Map(exceptions.map((exception) => [exception.occurrenceKey, exception]));
  // Moved exceptions can intersect this range even if their original date does not.
  for (const exception of exceptions) keys.add(exception.occurrenceKey);
  const events: CalendarEvent[] = [];
  for (const key of keys) {
    if (entry.recurrenceUntil && key >= entry.recurrenceUntil) continue;
    const exception = byKey.get(key);
    if (exception?.cancelled || (exception && !isCalendarOccurrence(entry, key))) continue;
    const input = calendarEntrySchema.parse({ ...calendarOccurrenceInput(entry, key), ...(exception?.patch && typeof exception.patch === "object" ? exception.patch : {}) });
    const event = eventFromInput(entry, key, input);
    const date = (input.kind === "todo" ? input.dueDate : input.start)?.slice(0, 10);
    const endDate = input.end?.slice(0, 10);
    let inRange = !date || (date < end && (date >= start || Boolean(endDate && endDate > start)));
    if (input.kind === "appointment" && !input.allDay) {
      const rangeStart = Temporal.PlainDate.from(start).toZonedDateTime(rangeTimeZone).toInstant();
      const rangeEnd = Temporal.PlainDate.from(end).toZonedDateTime(rangeTimeZone).toInstant();
      inRange = Temporal.Instant.compare(Temporal.Instant.from(event.start!), rangeEnd) < 0
        && Temporal.Instant.compare(Temporal.Instant.from(event.end!), rangeStart) > 0;
    }
    if (inRange) events.push(event);
    if (events.length > limit) throw new RangeError("Calendar range has too many occurrences.");
  }
  return events;
}

/** Store only deviations, so a later series edit does not overwrite them with stale base fields. */
export function calendarExceptionPatch(base: CalendarEntryInput, changed: CalendarEntryInput) {
  const original = normalizeCalendarEntry(base);
  const modified = { ...normalizeCalendarEntry(changed), completed: changed.completed };
  return Object.fromEntries(Object.entries(modified).filter(([key, value]) => key !== "recurrence" && JSON.stringify(value) !== JSON.stringify(original[key as keyof CalendarEntryInput])));
}
