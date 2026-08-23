import bcrypt from "bcryptjs";
import { z } from "zod";

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

export function canChangeLocalPassword(passwordHash: string | null | undefined) {
  return Boolean(passwordHash);
}

export async function currentPasswordMatches(currentPassword: string, passwordHash: string | null | undefined) {
  return passwordHash ? bcrypt.compare(currentPassword, passwordHash) : false;
}
