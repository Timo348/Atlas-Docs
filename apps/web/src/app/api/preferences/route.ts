import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";
import { preferencesSchema } from "@/lib/preferences";

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = preferencesSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
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
