import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canViewInstanceMetrics, type MetricsAccessUser } from "../src/lib/metrics-access";
import { instanceMetricsResponse } from "../src/lib/metrics-endpoint";
import { createUserSchema, updateUserSchema } from "../src/lib/user-administration";
import { profileUpdateSchema } from "../src/lib/account-settings";
import { DEFAULT_PREFERENCES, preferencesUpdateSchema } from "../src/lib/preferences";
import { PAGE_FORMATS, type InstanceMetrics } from "../src/lib/instance-metrics";

const bearerToken = "a-separate-prometheus-token-with-32-characters";

function snapshot(): InstanceMetrics {
  return {
    collectedAt: new Date("2026-09-30T12:00:00.000Z"),
    users: { ADMIN: { active: 1, inactive: 0 }, MEMBER: { active: 2, inactive: 1 } },
    spaces: 2,
    folders: 3,
    pages: Object.fromEntries(PAGE_FORMATS.map((format) => [format, 0])) as InstanceMetrics["pages"],
    pageVersions: 0,
    pageImages: 0,
    collaborationDocuments: 0,
    shares: { active: { VIEW: 0, EDIT: 0 }, revoked: { VIEW: 0, EDIT: 0 }, expired: { VIEW: 0, EDIT: 0 } },
    storage: { uploadedFiles: 0n, pageImages: 0n, collaborationDocuments: 0n, profileImages: 0n, spaceImages: 0n, total: 0n },
  };
}

function request(authorization?: string) {
  return new Request("http://atlas.test/api/metrics", { headers: authorization ? { authorization } : undefined });
}

test("only active administrators or explicitly granted active members can view instance metrics", () => {
  assert.equal(canViewInstanceMetrics({ active: true, role: "ADMIN", metricsAccess: false }), true);
  assert.equal(canViewInstanceMetrics({ active: false, role: "ADMIN", metricsAccess: true }), false);
  assert.equal(canViewInstanceMetrics({ active: true, role: "MEMBER", metricsAccess: true }), true);
  assert.equal(canViewInstanceMetrics({ active: true, role: "MEMBER", metricsAccess: false }), false);
  assert.equal(canViewInstanceMetrics({ active: true, role: "MEMBER" }), false);
  assert.equal(canViewInstanceMetrics({ active: false, role: "MEMBER", metricsAccess: true }), false);
  assert.equal(canViewInstanceMetrics({ active: true, role: "unexpected", metricsAccess: true }), false);
  assert.equal(canViewInstanceMetrics(null), false);
});

test("anonymous scraping remains disabled without a token and requires a valid bearer when configured", async () => {
  let reads = 0;
  const dependencies = { token: null as string | null, currentUser: async () => null, collect: async () => { reads += 1; return snapshot(); } };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 404);
  dependencies.token = bearerToken;
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 401);
  assert.equal((await instanceMetricsResponse(request("Bearer wrong"), dependencies)).status, 401);
  assert.equal(reads, 0);
  const response = await instanceMetricsResponse(request(`Bearer ${bearerToken}`), dependencies);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^atlas_spaces 2$/m);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.match(response.headers.get("content-type") || "", /version=0\.0\.4/);
  assert.equal(reads, 1);
});

test("browser metrics use current access, immediately applying grant revocation, role demotion, and locks", async () => {
  let currentUser: MetricsAccessUser = { active: true, role: "MEMBER", metricsAccess: false };
  let reads = 0;
  let accessReads = 0;
  const dependencies = {
    token: null,
    currentUser: async () => { accessReads += 1; return currentUser; },
    collect: async () => { reads += 1; return snapshot(); },
  };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 403);
  currentUser = { ...currentUser, metricsAccess: true };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 200);
  currentUser = { ...currentUser, metricsAccess: false };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 403);
  currentUser = { ...currentUser, role: "ADMIN" };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 200);
  currentUser = { ...currentUser, role: "MEMBER" };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 403);
  currentUser = { ...currentUser, active: false, metricsAccess: true };
  assert.equal((await instanceMetricsResponse(request(), dependencies)).status, 403);
  assert.equal(reads, 2);
  assert.equal(accessReads, 6);
});

test("a bearer attempt never falls back to an administrator browser session", async () => {
  let accessReads = 0;
  const response = await instanceMetricsResponse(request("Bearer incorrect"), {
    token: bearerToken,
    currentUser: async () => { accessReads += 1; return { active: true, role: "ADMIN" }; },
    collect: async () => snapshot(),
  });
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") || "", /Bearer/);
  assert.equal(accessReads, 0);
});

test("metrics failures fail closed and do not expose database errors", async () => {
  const response = await instanceMetricsResponse(request(), {
    token: null,
    currentUser: async () => { throw new Error("sensitive database details"); },
    collect: async () => snapshot(),
  });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "Service Unavailable\n");
});

test("administrator grant schemas default to no access and require explicit boolean grants", () => {
  const member = createUserSchema.parse({ name: "Member", email: "MEMBER@atlas.test", password: "a-long-initial-password" });
  assert.equal(member.role, "MEMBER");
  assert.equal(member.metricsAccess, false);
  assert.deepEqual(updateUserSchema.parse({ metricsAccess: true }), { metricsAccess: true });
  assert.deepEqual(updateUserSchema.parse({ metricsAccess: false }), { metricsAccess: false });
  assert.equal(updateUserSchema.safeParse({ metricsAccess: "true" }).success, false);
  assert.equal(updateUserSchema.safeParse({ metricsAccess: null }).success, false);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(updateUserSchema.safeParse({ metricsAccess: true, arbitraryPermission: true }).success, false);
});

test("profile and preferences updates cannot inject dashboard grants", () => {
  assert.equal("metricsAccess" in profileUpdateSchema.parse({ name: "Member", metricsAccess: true }), false);
  assert.equal("metricsAccess" in preferencesUpdateSchema.parse({ ...DEFAULT_PREFERENCES, metricsAccess: true }), false);
});

test("grant mutations and metrics views use fresh database authorization", () => {
  for (const path of ["../src/app/api/users/route.ts", "../src/app/api/users/[id]/route.ts"]) {
    const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    assert.match(source, /await requireApiUser\(\)/);
    assert.match(source, /if \((?:admin|user)\.role !== "ADMIN"\) return apiErrorResponse\("ADMIN_REQUIRED", 403\)/);
  }
  const access = readFileSync(fileURLToPath(new URL("../src/lib/access.ts", import.meta.url)), "utf8");
  assert.match(access, /db\.user\.findFirst\(\{ where: \{ id: session\.user\.id, active: true \} \}\)/);
  assert.match(access, /db\.user\.findUnique\(\{ where: \{ id: session\.user\.id \} \}\)/);
});
