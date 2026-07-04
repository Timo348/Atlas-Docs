import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { canEdit, pageAccess, requireApiUser } from "@/lib/access";

export async function GET(request: NextRequest) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const pageId = request.nextUrl.searchParams.get("pageId");
  if (!pageId) return NextResponse.json({ error: "pageId fehlt" }, { status: 400 });

  const page = await pageAccess(user.id, pageId);
  if (!page) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  const secret = process.env.COLLAB_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Server nicht konfiguriert" }, { status: 500 });
  }

  const token = await new SignJWT({
    pageId,
    name: user.name || user.email,
    readOnly: !canEdit(page.accessRole),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("atlas-web")
    .setAudience("atlas-collaboration")
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({
    token,
    readOnly: !canEdit(page.accessRole),
    user: { id: user.id, name: user.name || user.email },
  });
}
