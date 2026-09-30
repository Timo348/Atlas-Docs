import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { createUserSchema } from "@/lib/user-administration";

export async function GET() {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  if (user.role !== "ADMIN") return apiErrorResponse("ADMIN_REQUIRED", 403);
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      metricsAccess: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const admin = await requireApiUser();
  if (!admin) return apiErrorResponse("AUTH_REQUIRED", 401);
  if (admin.role !== "ADMIN") return apiErrorResponse("ADMIN_REQUIRED", 403);
  const parsed = createUserSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiErrorResponse("USER_CREATE_INPUT_INVALID", 400);
  }
  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return apiErrorResponse("EMAIL_CONFLICT", 409);
  const start = await db.space.findUnique({ where: { slug: "start" } });
  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 12),
      role: parsed.data.role,
      metricsAccess: parsed.data.metricsAccess,
      memberships: start ? { create: { spaceId: start.id, role: "EDITOR" } } : undefined,
    },
    select: { id: true, name: true, email: true, role: true, active: true, metricsAccess: true },
  });
  return NextResponse.json(user, { status: 201 });
}
