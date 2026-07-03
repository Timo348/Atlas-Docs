import { PrismaClient, SpaceRole, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters are required.");
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: UserRole.ADMIN, active: true },
    create: {
      email,
      name: process.env.ADMIN_NAME?.trim() || "Administrator",
      passwordHash: await bcrypt.hash(password, 12),
      role: UserRole.ADMIN,
    },
  });

  const space = await prisma.space.upsert({
    where: { slug: "start" },
    update: {},
    create: {
      name: "Start",
      slug: "start",
      description: "Der zentrale Wissensbereich",
    },
  });

  await prisma.membership.upsert({
    where: { userId_spaceId: { userId: admin.id, spaceId: space.id } },
    update: { role: SpaceRole.OWNER },
    create: { userId: admin.id, spaceId: space.id, role: SpaceRole.OWNER },
  });

  await prisma.page.upsert({
    where: { spaceId_slug: { spaceId: space.id, slug: "willkommen" } },
    update: {},
    create: {
      title: "Willkommen",
      slug: "willkommen",
      spaceId: space.id,
      createdById: admin.id,
    },
  });
}

main()
  .finally(async () => prisma.$disconnect());
