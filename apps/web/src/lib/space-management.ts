import { z } from "zod";

export type GlobalUserRole = "ADMIN" | "MEMBER";
export type ManagedSpaceRole = "OWNER" | "EDITOR" | "VIEWER";

export const spaceNameUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
}).strict();

export function canManageSpace(
  userRole: GlobalUserRole,
  spaceRole: ManagedSpaceRole | null,
) {
  return userRole === "ADMIN" || spaceRole === "OWNER";
}
