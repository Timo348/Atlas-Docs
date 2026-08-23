import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import { profileUpdateSchema } from "@/lib/account-settings";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const parsed = profileUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PROFILE_INVALID", 400);
  const profile = await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
    select: { name: true, email: true },
  });
  return NextResponse.json(profile);
}
