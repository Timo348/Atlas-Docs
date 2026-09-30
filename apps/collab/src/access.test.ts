import assert from "node:assert/strict";
import { test } from "node:test";
import { currentPageRole, writableRole, type AccessDatabase } from "./access.js";

test("live rights respect active users, revoked memberships, and expiring team grants", async () => {
  let active = true;
  let direct: string | null = "VIEWER";
  let teamExpiry = new Date("2026-10-01T10:00:00Z");
  const database = {
    user: { findFirst: async () => active ? { id: "u" } : null },
    page: { findUnique: async () => ({ spaceId: "s" }) },
    membership: { findUnique: async () => direct ? { role: direct } : null },
    spaceTeamAccess: { findMany: async (args: { where: { team: { members: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: Date } }] } } } } }) => {
      const current = args.where.team.members.some.OR[1].expiresAt.gt;
      return teamExpiry > current ? [{ role: "EDITOR" }] : [];
    } },
  } as unknown as AccessDatabase;
  assert.equal(await currentPageRole(database, "u", "p", new Date("2026-10-01T09:00:00Z")), "EDITOR");
  assert.equal(await currentPageRole(database, "u", "p", teamExpiry), "VIEWER");
  assert.equal(writableRole("VIEWER"), false);
  direct = null;
  assert.equal(await currentPageRole(database, "u", "p", teamExpiry), null);
  teamExpiry = new Date("2026-10-02T00:00:00Z");
  active = false;
  assert.equal(await currentPageRole(database, "u", "p", new Date("2026-10-01")), null);
});
