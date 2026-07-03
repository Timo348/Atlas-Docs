import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { clearLoginAttempts, consumeLoginAttempt } from "@/lib/login-limit";

export type AuthMode = "local" | "oidc" | "both";

export function getAuthMode(): AuthMode {
  const value = process.env.AUTH_MODE || "local";
  if (value !== "local" && value !== "oidc" && value !== "both") {
    throw new Error("AUTH_MODE must be local, oidc, or both.");
  }
  return value;
}

const mode = getAuthMode();
const providers: NextAuthOptions["providers"] = [];

if (mode === "local" || mode === "both") {
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Lokales Konto",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.trim().toLowerCase();
        if (!email || !credentials?.password) return null;
        const forwarded = request.headers?.["x-forwarded-for"];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || "unknown";
        try {
          if (!(await consumeLoginAttempt(email, ip))) return null;
        } catch {
          return null;
        }
        const user = await db.user.findUnique({ where: { email } });
        if (!user?.active || !user.passwordHash) return null;
        if (!(await bcrypt.compare(credentials.password, user.passwordHash))) return null;
        await clearLoginAttempts(email, ip);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          active: user.active,
        };
      },
    }),
  );
}

if (mode === "oidc" || mode === "both") {
  const issuer = process.env.OIDC_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error("OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required.");
  }
  providers.push({
    id: "authentik",
    name: "Authentik",
    type: "oauth",
    wellKnown: `${issuer}/.well-known/openid-configuration`,
    clientId,
    clientSecret,
    idToken: true,
    checks: ["pkce", "state"],
    authorization: { params: { scope: "openid email profile" } },
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name || profile.preferred_username,
        email: profile.email,
        image: profile.picture,
        role: "MEMBER",
        active: true,
      };
    },
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
      return existing?.active !== false;
    },
    async jwt({ token, user }) {
      const id = user?.id || token.userId || token.sub;
      if (id) {
        const current = await db.user.findUnique({
          where: { id },
          select: { id: true, role: true, active: true, name: true, email: true, image: true },
        });
        if (current) {
          token.userId = current.id;
          token.role = current.role;
          token.active = current.active;
          token.name = current.name;
          token.email = current.email;
          token.picture = current.image;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId && token.role) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.active = token.active === true;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const space = await db.space.findUnique({ where: { slug: "start" } });
      if (space) {
        await db.membership.create({
          data: { userId: user.id, spaceId: space.id, role: "EDITOR" },
        });
      }
    },
  },
};
