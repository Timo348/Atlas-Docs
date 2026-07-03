import { NextResponse } from "next/server";

export async function GET() {
  const collaborationUrl = process.env.PUBLIC_COLLAB_URL || "ws://localhost:30003";
  let parsed: URL;
  try {
    parsed = new URL(collaborationUrl);
  } catch {
    return NextResponse.json({ error: "PUBLIC_COLLAB_URL ist ungültig" }, { status: 500 });
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    return NextResponse.json({ error: "PUBLIC_COLLAB_URL muss ws:// oder wss:// verwenden" }, { status: 500 });
  }
  return NextResponse.json({ collaborationUrl: parsed.toString().replace(/\/$/, "") });
}
