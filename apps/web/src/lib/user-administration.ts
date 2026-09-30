import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  metricsAccess: z.boolean().default(false),
}).strict();

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  password: z.string().min(12).max(128).optional(),
  metricsAccess: z.boolean().optional(),
}).strict().refine((value) => Object.values(value).some((entry) => entry !== undefined));
