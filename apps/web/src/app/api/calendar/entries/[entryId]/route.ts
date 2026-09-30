import { Prisma } from "@prisma/client";
import { Temporal } from "temporal-polyfill";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { calendarEntrySchema, calendarMutationSchema } from "@/lib/calendar";
import { calendarAnchor, calendarExceptionPatch, calendarOccurrenceInput, calendarRecordInput, isCalendarOccurrence, normalizeCalendarEntry, previousCalendarOccurrence, remainingCalendarRecurrence } from "@/lib/calendar-recurrence";
import { calendarEntryData, calendarEntryDto } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ entryId: string }> };
class Conflict extends Error {}
export async function GET(_: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { entryId } = await context.params;
  const entry = await db.calendarEntry.findFirst({ where: { id: entryId, userId: user.id } });
  if (!entry) return apiErrorResponse("FILE_NOT_FOUND", 404);
  return Response.json({ entry: calendarEntryDto(entry) }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request, context: Context) { return mutate(request, context, false); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
async function mutate(request: Request, context: Context, remove: boolean) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const { entryId } = await context.params;
  const parsed = calendarMutationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);
  const { scope, occurrenceKey, revision, ...changes } = parsed.data;
  // Owner condition applies to every read and write. Admin role does not bypass it.
  const entry = await db.calendarEntry.findFirst({ where: { id: entryId, userId: user.id } });
  if (!entry) return apiErrorResponse("FILE_NOT_FOUND", 404);
  if (entry.revision !== revision) return apiErrorResponse("CALENDAR_CONFLICT", 409);
  const key = occurrenceKey && occurrenceKey.length > 10 ? Temporal.PlainDateTime.from(occurrenceKey).toString({ smallestUnit: "second" }) : occurrenceKey;
  if (entry.recurrence && (!key || !isCalendarOccurrence(entry, key))) return apiErrorResponse("INVALID_INPUT", 400);
  let nextInput = calendarRecordInput(entry);
  if (!remove) {
    const base = entry.recurrence ? calendarOccurrenceInput(entry, key!) : nextInput;
    const exception = entry.recurrence && scope === "occurrence"
      ? await db.calendarException.findUnique({ where: { entryId_occurrenceKey: { entryId, occurrenceKey: key! } } }) : null;
    const valid = calendarEntrySchema.safeParse({ ...base, ...(exception?.patch && typeof exception.patch === "object" ? exception.patch : {}), ...changes });
    if (!valid.success) return apiErrorResponse("INVALID_INPUT", 400);
    nextInput = valid.data;
    if (entry.recurrence && scope === "occurrence" && JSON.stringify(nextInput.recurrence) !== JSON.stringify(base.recurrence)) return apiErrorResponse("INVALID_INPUT", 400);
    if (entry.recurrence && scope === "following" && (changes.recurrence === undefined || JSON.stringify(changes.recurrence) === JSON.stringify(calendarRecordInput(entry).recurrence))) nextInput.recurrence = remainingCalendarRecurrence(entry, key!);
    if (entry.recurrence && (nextInput.kind !== entry.kind || nextInput.allDay !== entry.allDay)) return apiErrorResponse("INVALID_INPUT", 400);
    if (entry.recurrence && scope === "following") {
      const previous = previousCalendarOccurrence(entry, key!);
      if (!calendarAnchor(nextInput) || (previous && calendarAnchor(nextInput)! <= previous)) return apiErrorResponse("INVALID_INPUT", 400);
    }
    if (entry.recurrence && scope === "following" && entry.recurrenceUntil && calendarAnchor(nextInput)! >= entry.recurrenceUntil) return apiErrorResponse("INVALID_INPUT", 400);
  }
  try {
    const result = await db.$transaction(async (transaction) => {
      const locked = await transaction.calendarEntry.updateMany({ where: { id: entryId, userId: user.id, revision }, data: { revision: { increment: 1 } } });
      if (locked.count !== 1) throw new Conflict();
      if (!entry.recurrence) {
        if (remove) { await transaction.calendarEntry.delete({ where: { id: entryId } }); return null; }
        return transaction.calendarEntry.update({ where: { id: entryId }, data: calendarEntryData(normalizeCalendarEntry(nextInput)) });
      }
      if (scope === "occurrence") {
        const patch = calendarExceptionPatch(calendarOccurrenceInput(entry, key!), nextInput) as Prisma.InputJsonValue;
        await transaction.calendarException.upsert({
          where: { entryId_occurrenceKey: { entryId, occurrenceKey: key! } },
          create: { userId: user.id, entryId, occurrenceKey: key!, cancelled: remove, patch: remove ? {} : patch },
          update: { cancelled: remove, patch: remove ? {} : patch },
        });
        return transaction.calendarEntry.findUniqueOrThrow({ where: { id: entryId } });
      }
      // Split the series at an exclusive local key; earlier events and exceptions stay intact.
      await transaction.calendarEntry.update({ where: { id: entryId }, data: { recurrenceUntil: key! } });
      if (remove) return null;
      const data = normalizeCalendarEntry(nextInput);
      // A following edit can move the start but cannot overlap the preserved history.
      const anchor = calendarAnchor(data);
      if (!anchor) throw new Error("Invalid recurring anchor");
      const created = await transaction.calendarEntry.create({ data: { userId: user.id, ...calendarEntryData(data), recurrenceUntil: entry.recurrenceUntil } });
      const oldRule = calendarRecordInput(entry).recurrence!;
      if (anchor === key && data.recurrence?.frequency === oldRule.frequency && data.recurrence.interval === oldRule.interval) {
        const futureExceptions = await transaction.calendarException.findMany({ where: { entryId, userId: user.id, occurrenceKey: { gte: key! } } });
        const applicable = futureExceptions.filter((exception) => isCalendarOccurrence(created, exception.occurrenceKey));
        if (applicable.length) await transaction.calendarException.createMany({ data: applicable.map((exception) => ({
          entryId: created.id, userId: user.id, occurrenceKey: exception.occurrenceKey, cancelled: exception.cancelled, patch: exception.patch as Prisma.InputJsonValue,
        })) });
      }
      return created;
    });
    return Response.json({ entry: result ? calendarEntryDto(result) : null });
  } catch (error) {
    if (error instanceof Conflict) return apiErrorResponse("CALENDAR_CONFLICT", 409);
    throw error;
  }
}
