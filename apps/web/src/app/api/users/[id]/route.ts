import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/user-administration";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireApiUser();
  if (!admin) return apiErrorResponse("AUTH_REQUIRED", 401);
  if (admin.role !== "ADMIN") return apiErrorResponse("ADMIN_REQUIRED", 403);
  const { id } = await context.params;
  const parsed = updateUserSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("INVALID_INPUT", 400);
  if (id === admin.id && (parsed.data.active === false || parsed.data.role === "MEMBER")) {
    return apiErrorResponse("OWN_ADMIN_ACCOUNT_REQUIRED", 400);
  }
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return apiErrorResponse("USER_NOT_FOUND", 404);
  if (target.role === "ADMIN" && (parsed.data.active === false || parsed.data.role === "MEMBER")) {
    const activeAdmins = await db.user.count({ where: { role: "ADMIN", active: true } });
    if (activeAdmins <= 1) {
      return apiErrorResponse("LAST_ADMIN_REQUIRED", 400);
    }
  }
  const user = await db.user.update({
    where: { id },
    data: {
      active: parsed.data.active,
      role: parsed.data.role,
      metricsAccess: parsed.data.metricsAccess,
      passwordHash: parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true, metricsAccess: true },
  });
  return NextResponse.json(user);
}
