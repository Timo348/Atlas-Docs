import { jwtVerify } from "jose";

export type CollaborationClaims = {
  sub: string;
  pageId: string;
  name: string;
  readOnly: boolean;
};

export async function verifyCollaborationToken(
  token: string,
  secret: string,
  documentName: string,
): Promise<CollaborationClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    audience: "atlas-collaboration",
    issuer: "atlas-web",
  });

  if (
    typeof payload.sub !== "string" ||
    typeof payload.pageId !== "string" ||
    typeof payload.name !== "string" ||
    documentName !== `page:${payload.pageId}`
  ) {
    throw new Error("Invalid collaboration token.");
  }

  return {
    sub: payload.sub,
    pageId: payload.pageId,
    name: payload.name,
    readOnly: payload.readOnly === true,
  };
}
