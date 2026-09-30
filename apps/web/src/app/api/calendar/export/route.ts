import { requireApiUser } from "@/lib/access";
import { apiErrorResponse } from "@/lib/api-errors";
import { personalCalendarExport } from "@/lib/calendar-server";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  return new Response(`${JSON.stringify(await personalCalendarExport(user.id), null, 2)}\n`, { headers: {
    "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="atlas-personal-calendar.json"',
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
