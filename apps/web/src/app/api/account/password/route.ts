import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import {
  canChangeLocalPassword,
  currentPasswordMatches,
  passwordChangeSchema,
} from "@/lib/account-settings";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  if (!canChangeLocalPassword(user.passwordHash)) {
    return apiErrorResponse("PASSWORD_MANAGED_EXTERNALLY", 409);
  }
  const parsed = passwordChangeSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PASSWORD_INVALID", 400);
  if (!(await currentPasswordMatches(parsed.data.currentPassword, user.passwordHash))) {
    return apiErrorResponse("PASSWORD_CURRENT_INVALID", 400);
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) },
  });
  return NextResponse.json({ ok: true });
}
