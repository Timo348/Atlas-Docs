import { NextResponse } from "next/server";
import { pageAccess, requireApiUser } from "@/lib/access";
import { db } from "@/lib/db";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string; versionId: string }> },
) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const { id, versionId } = await context.params;
  const page = await pageAccess(user.id, id);
  if (!page) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const version = await db.pageVersion.findFirst({
    where: { id: versionId, pageId: id },
    select: { id: true, version: true, title: true, data: true },
  });
  if (!version) return NextResponse.json({ error: "Version nicht gefunden" }, { status: 404 });
  return NextResponse.json({
    id: version.id,
    version: version.version,
    title: version.title,
    snapshot: Buffer.from(version.data).toString("base64"),
  });
}
