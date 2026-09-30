import { Temporal } from "temporal-polyfill";

export const CALENDAR_VIEWS = { month: "dayGridMonth", week: "timeGridWeek", day: "timeGridDay", agenda: "listMonth" } as const;
export type CalendarView = keyof typeof CALENDAR_VIEWS;
const SOURCE_COLORS = ["#386c60", "#526fb5", "#96713b", "#826098", "#ab6352", "#527d91"];

export function calendarSourceColor(id: string) {
  let value = 0;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return SOURCE_COLORS[value % SOURCE_COLORS.length];
}

export function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"; } catch { return "Europe/Berlin"; }
}

export function calendarToday(timeZone = browserTimeZone()) { return Temporal.Now.plainDateISO(timeZone).toString(); }
export function addCalendarDays(value: string, days: number) { return Temporal.PlainDate.from(value).add({ days }).toString(); }
export function localCalendarTime(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  try { return Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" }); }
  catch { return value.slice(0, 16); }
}
export function calendarInstant(value: string, timeZone: string) {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant().toString();
}
