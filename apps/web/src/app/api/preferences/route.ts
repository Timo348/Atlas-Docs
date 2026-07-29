import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import { apiErrorResponse, readJsonBody } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { preferencesSchema } from "@/lib/preferences";

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return apiErrorResponse("AUTH_REQUIRED", 401);
  const parsed = preferencesSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return apiErrorResponse("PREFERENCES_INVALID", 400);
  const preferences = await db.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: {
      language: true,
      colorTheme: true,
      uiFont: true,
      editorFont: true,
      fontSize: true,
      compactMode: true,
    },
  });
  return NextResponse.json(preferences);
}
