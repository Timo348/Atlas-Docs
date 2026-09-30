import assert from "node:assert/strict";
import test from "node:test";
import { calendarEntrySchema, calendarMutationSchema, calendarPreferencesSchema, calendarRange, normalizeCalendarPreferences } from "../src/lib/calendar";
import { calendarExceptionPatch, calendarOccurrenceInput, expandCalendarEntry, isCalendarOccurrence, normalizeCalendarEntry, previousCalendarOccurrence, remainingCalendarRecurrence, type CalendarRecord } from "../src/lib/calendar-recurrence";

function entry(changes: Partial<CalendarRecord> = {}): CalendarRecord {
  return { id: "private-a", userId: "alice", kind: "appointment", title: "Weekly meeting", description: "", location: null,
    allDay: false, start: "2026-03-22T09:00:00", end: "2026-03-22T10:00:00", dueDate: null,
    timeZone: "Europe/Berlin", completed: false, priority: "MEDIUM", recurrence: { frequency: "weekly", interval: 1 }, recurrenceUntil: null, revision: 1, ...changes };
}
test("weekly appointments preserve their local time across both Berlin clock changes", () => {
  const spring = expandCalendarEntry(entry(), [], "2026-03-20", "2026-04-10");
  assert.deepEqual(spring.map((event) => event.start), ["2026-03-22T08:00:00Z", "2026-03-29T07:00:00Z", "2026-04-05T07:00:00Z"]);
  assert.ok(spring.every((event) => event.entry!.start!.endsWith("T09:00:00")));
  const fall = expandCalendarEntry(entry({ start: "2026-10-18T09:00:00", end: "2026-10-18T10:00:00" }), [], "2026-10-17", "2026-11-02");
  assert.deepEqual(fall.map((event) => event.start), ["2026-10-18T07:00:00Z", "2026-10-25T08:00:00Z", "2026-11-01T08:00:00Z"]);
});
test("spring clock gaps never create an inverted appointment", () => {
  assert.equal(calendarEntrySchema.safeParse({ kind: "appointment", title: "Gap", start: "2027-03-28T02:30", end: "2027-03-28T03:00", timeZone: "Europe/Berlin" }).success, false);
  const weekly = entry({ start: "2027-03-21T02:30:00", end: "2027-03-21T03:00:00" });
  const gap = expandCalendarEntry(weekly, [], "2027-03-28", "2027-03-29")[0];
  assert.equal(gap.start, "2027-03-28T01:30:00Z");
  assert.equal(gap.end, "2027-03-28T02:00:00Z");
});
test("month-end and leap-year recurrences follow RRule calendar dates", () => {
  const monthly = entry({ kind: "todo", start: null, end: null, allDay: true, dueDate: "2026-01-31", recurrence: { frequency: "monthly", interval: 1, count: 3 } });
  assert.deepEqual(expandCalendarEntry(monthly, [], "2026-01-01", "2026-06-01").map((event) => event.start), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  const leap = entry({ allDay: true, start: "2024-02-29", end: "2024-03-01", recurrence: { frequency: "yearly", interval: 1 } });
  assert.equal(expandCalendarEntry(leap, [], "2025-01-01", "2026-01-01").length, 0);
  assert.equal(expandCalendarEntry(leap, [], "2028-02-01", "2028-03-01")[0].start, "2028-02-29");
});
test("a todo completion or deletion applies to one occurrence only", () => {
  const daily = entry({ kind: "todo", allDay: true, start: null, end: null, dueDate: "2026-09-01", recurrence: { frequency: "daily", interval: 1, count: 4 } });
  const events = expandCalendarEntry(daily, [
    { occurrenceKey: "2026-09-02", cancelled: false, patch: { completed: true } },
    { occurrenceKey: "2026-09-03", cancelled: true, patch: {} },
  ], "2026-09-01", "2026-09-06");
  assert.deepEqual(events.map((event) => [event.start, event.completed]), [["2026-09-01", false], ["2026-09-02", true], ["2026-09-04", false]]);
});
test("moved exceptions appear in the new range and disappear from the old one", () => {
  const original = entry();
  const exceptions = [{ occurrenceKey: "2026-03-22T09:00:00", cancelled: false, patch: { start: "2026-05-02T09:00:00", end: "2026-05-02T10:00:00" } }];
  assert.equal(expandCalendarEntry(original, exceptions, "2026-03-21", "2026-03-23").length, 0);
  assert.equal(expandCalendarEntry(original, exceptions, "2026-05-02", "2026-05-03")[0].occurrenceKey, "2026-03-22T09:00:00");
});
test("splitting a counted series preserves past occurrences and its remaining count", () => {
  const original = entry({ recurrence: { frequency: "weekly", interval: 1, count: 4 } });
  const splitKey = "2026-04-05T09:00:00";
  assert.deepEqual(remainingCalendarRecurrence(original, splitKey), { frequency: "weekly", interval: 1, count: 2 });
  const old = { ...original, recurrenceUntil: splitKey };
  const oldEvents = expandCalendarEntry(old, [{ occurrenceKey: "2026-03-29T09:00:00", cancelled: false, patch: { title: "Past exception" } }], "2026-03-01", "2026-05-01");
  assert.equal(oldEvents.length, 2);
  assert.equal(oldEvents[1].title, "Past exception");
  assert.equal(isCalendarOccurrence(old, splitKey), false);
  assert.equal(isCalendarOccurrence(original, "2026-04-06T09:00:00"), false);
  assert.equal(calendarOccurrenceInput(original, splitKey).end, "2026-04-05T10:00:00");
  const previous = previousCalendarOccurrence(original, splitKey)!;
  assert.equal(previous, "2026-03-29T09:00:00");
  assert.ok("2026-04-05T08:00:00" > previous);
});
test("all-day events and deadlines remain date-only and the end is exclusive", () => {
  const allDay = entry({ allDay: true, start: "2026-03-28", end: "2026-03-30", recurrence: null });
  const event = expandCalendarEntry(allDay, [], "2026-03-29", "2026-03-30")[0];
  assert.equal(event.start, "2026-03-28");
  assert.equal(event.end, "2026-03-30");
  assert.equal(expandCalendarEntry(allDay, [], "2026-03-30", "2026-03-31").length, 0);
  const normalized = normalizeCalendarEntry(calendarEntrySchema.parse({ kind: "todo", title: "Task", dueDate: "2026-03-29", timeZone: "Pacific/Honolulu" }));
  assert.equal(normalized.dueDate, "2026-03-29");
  assert.equal(normalized.start, null);
});
test("timed appointments are included by the viewer's zone at date-range boundaries", () => {
  const hawaii = entry({ start: "2026-09-29T23:00:00", end: "2026-09-29T23:30:00", timeZone: "Pacific/Honolulu", recurrence: { frequency: "daily", interval: 1 } });
  const events = expandCalendarEntry(hawaii, [], "2026-09-30", "2026-10-01", 5000, "Europe/Berlin");
  assert.equal(events.length, 1);
  assert.equal(events[0].occurrenceKey, "2026-09-29T23:00:00");
  assert.equal(events[0].start, "2026-09-30T09:00:00Z");
});
test("single completion exceptions do not capture stale title or date values", () => {
  const daily = entry({ kind: "todo", allDay: true, start: null, end: null, dueDate: "2026-09-01", recurrence: { frequency: "daily", interval: 1, count: 4 } });
  const occurrence = calendarOccurrenceInput(daily, "2026-09-03");
  assert.deepEqual(calendarExceptionPatch(occurrence, { ...occurrence, completed: true }), { completed: true });
  const renamed = { ...daily, title: "New title" };
  const events = expandCalendarEntry(renamed, [{ occurrenceKey: "2026-09-03", cancelled: false, patch: { completed: true } }], "2026-09-03", "2026-09-04");
  assert.equal(events[0].title, "New title");
  assert.equal(events[0].completed, true);
});
test("calendar inputs reject invalid dates, time zones, remote ownership and unbounded ranges", () => {
  assert.equal(calendarEntrySchema.safeParse({ kind: "todo", title: "Task", dueDate: "2026-02-29" }).success, false);
  assert.equal(calendarEntrySchema.safeParse({ kind: "todo", title: "Task", timeZone: "Mars/Olympus" }).success, false);
  assert.equal(calendarEntrySchema.safeParse({ kind: "todo", title: "Task", userId: "other" }).success, false);
  assert.equal(calendarEntrySchema.safeParse({ kind: "todo", title: "Task", recurrence: { frequency: "daily", interval: 1 } }).success, false);
  assert.equal(calendarMutationSchema.safeParse({ revision: 1, userId: "other" }).success, false);
  assert.equal(calendarPreferencesSchema.safeParse({ userId: "other" }).success, false);
  assert.equal(calendarRange("2026-01-01", "2027-01-03"), null);
  assert.equal(calendarRange("2026-02-01", "2026-01-01"), null);
  assert.deepEqual(calendarRange("2026-01-01", "2027-01-01"), { start: "2026-01-01", end: "2027-01-01" });
});
test("preferences remember exclusions, add new spaces and remove revoked access", () => {
  const defaults = normalizeCalendarPreferences(null, ["a", "b"]);
  assert.deepEqual(defaults.selectedSpaceIds, ["a", "b"]);
  const saved = normalizeCalendarPreferences({ ...defaults, selectedSpaceIds: ["a"], taskScope: "mine", view: "listMonth" }, ["a", "b", "c"]);
  assert.deepEqual(saved.selectedSpaceIds, ["a", "c"]);
  assert.equal(saved.view, "listMonth");
  assert.equal(saved.taskScope, "mine");
  assert.deepEqual(normalizeCalendarPreferences(saved, ["b", "c"]).selectedSpaceIds, ["c"]);
});
