import type { DefaultSession } from "next-auth";
import type { UserRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      active: boolean;
    } & DefaultSession["user"];
  }

}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    active?: boolean;
  }
}
