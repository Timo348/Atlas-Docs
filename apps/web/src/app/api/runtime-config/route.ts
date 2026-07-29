import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
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
    console.error("[atlas-api] Collaboration configuration is invalid.", error);
    return apiErrorResponse("COLLABORATION_CONFIG_INVALID", 500);
  }
}
