import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, calendarInstant, localCalendarTime } from "../src/lib/calendar-display";

test("calendar dates remain pure dates through leap days and year boundaries", () => {
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
});

test("editing an appointment uses its own zone and rejects nonexistent or ambiguous times", () => {
  assert.equal(localCalendarTime("2026-03-29T07:00:00Z", "Europe/Berlin"), "2026-03-29T09:00");
  assert.equal(calendarInstant("2026-03-29T09:00", "Europe/Berlin"), "2026-03-29T07:00:00Z");
  assert.throws(() => calendarInstant("2026-03-29T02:30", "Europe/Berlin"));
  assert.throws(() => calendarInstant("2026-10-25T02:30", "Europe/Berlin"));
});
