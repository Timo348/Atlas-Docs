import { NextRequest, NextResponse } from "next/server";
import { resolveCollaborationUrl } from "@/lib/runtime-config";

export async function GET(request: NextRequest) {
  try {
    const collaborationUrl = resolveCollaborationUrl({
      configuredUrl: process.env.PUBLIC_COLLAB_URL,
      forwardedHost: request.headers.get("x-forwarded-host"),
      host: request.headers.get("host"),
      forwardedProtocol: request.headers.get("x-forwarded-proto"),
      requestProtocol: request.nextUrl.protocol,
      publicPort: process.env.PUBLIC_COLLAB_PORT,
    });
    return NextResponse.json({ collaborationUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Collaboration configuration is invalid." },
      { status: 500 },
    );
  }
}
