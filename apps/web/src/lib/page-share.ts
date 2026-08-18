import { createHash, randomBytes } from "node:crypto";

export type PageSharePermissionValue = "VIEW" | "EDIT";

export const PAGE_SHARE_TOKEN_BYTES = 32;
export const PAGE_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createPageShareToken() {
  return randomBytes(PAGE_SHARE_TOKEN_BYTES).toString("base64url");
}

export function pageShareTokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function validPageShareToken(token: string) {
  return PAGE_SHARE_TOKEN_PATTERN.test(token);
}

export function pageShareIsActive(
  share: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
) {
  return share.revokedAt === null && (share.expiresAt === null || share.expiresAt > now);
}

export function pageShareIsReadOnly(permission: PageSharePermissionValue) {
  return permission !== "EDIT";
}

export function canManagePageShares(userRole: string, spaceRole: string | null) {
  return userRole === "ADMIN" || spaceRole === "OWNER";
}
