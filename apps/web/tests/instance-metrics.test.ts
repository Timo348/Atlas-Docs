import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  collectInstanceMetrics,
  configuredPrometheusMetricsToken,
  hasPrometheusMetricsAuthorization,
  prometheusMetrics,
  shareState,
  type InstanceMetrics,
} from "../src/lib/instance-metrics";

const token = "atlas-metrics-token-with-at-least-32-characters";

test("requires a separate sufficiently long metrics token and checks bearer values safely", () => {
  assert.equal(configuredPrometheusMetricsToken("short"), null);
  assert.equal(configuredPrometheusMetricsToken(` ${token} `), token);
  assert.equal(hasPrometheusMetricsAuthorization(`Bearer ${token}`, token), true);
  assert.equal(hasPrometheusMetricsAuthorization(`bearer ${token}`, token), true);
  assert.equal(hasPrometheusMetricsAuthorization(`Bearer ${token}-wrong`, token), false);
  assert.equal(hasPrometheusMetricsAuthorization(null, token), false);
  assert.equal(hasPrometheusMetricsAuthorization(`Bearer ${token}`, null), false);
});

test("classifies revoked links before expiry and keeps unexpired links active", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.equal(shareState({ revokedAt: new Date("2026-08-24T12:00:00.000Z"), expiresAt: new Date("2026-08-24T12:00:00.000Z") }, now), "revoked");
  assert.equal(shareState({ revokedAt: null, expiresAt: new Date("2026-08-24T12:00:00.000Z") }, now), "expired");
  assert.equal(shareState({ revokedAt: null, expiresAt: new Date("2026-08-26T12:00:00.000Z") }, now), "active");
});

test("collects bounded aggregate labels without reading user-facing content", async () => {
  const fakeDatabase = {
    user: { groupBy: async () => [
      { role: "ADMIN", active: true, _count: { _all: 1 } },
      { role: "MEMBER", active: true, _count: { _all: 3 } },
      { role: "MEMBER", active: false, _count: { _all: 2 } },
    ] },
    page: { groupBy: async () => [
      { format: "MARKDOWN", _count: { _all: 5 } },
      { format: "FILE", _count: { _all: 2 } },
    ] },
    space: { count: async () => 4 },
    folder: { count: async () => 6 },
    pageVersion: { count: async () => 9 },
    pageImage: { count: async () => 7 },
    collabDocument: { count: async () => 5 },
    pageShare: { findMany: async () => [
      { permission: "VIEW", revokedAt: null, expiresAt: null },
      { permission: "EDIT", revokedAt: null, expiresAt: new Date(0) },
      { permission: "VIEW", revokedAt: new Date(0), expiresAt: null },
    ] },
    $queryRaw: async () => [{
      uploadedFiles: 20n,
      pageImages: 30n,
      collaborationDocuments: 40n,
      profileImages: 50n,
      spaceImages: 60n,
    }],
  };

  const metrics = await collectInstanceMetrics(fakeDatabase as never);
  assert.deepEqual(metrics.users, {
    ADMIN: { active: 1, inactive: 0 },
    MEMBER: { active: 3, inactive: 2 },
  });
  assert.equal(metrics.pages.MARKDOWN, 5);
  assert.equal(metrics.pages.FILE, 2);
  assert.equal(metrics.pages.CANVAS, 0);
  assert.equal(metrics.shares.active.VIEW, 1);
  assert.equal(metrics.shares.expired.EDIT, 1);
  assert.equal(metrics.shares.revoked.VIEW, 1);
  assert.equal(metrics.storage.total, 200n);
});

test("renders Prometheus text with stable aggregate metric families", () => {
  const snapshot: InstanceMetrics = {
    collectedAt: new Date("2026-08-25T12:00:00.000Z"),
    users: { ADMIN: { active: 1, inactive: 0 }, MEMBER: { active: 4, inactive: 1 } },
    spaces: 3,
    folders: 6,
    pages: { MARKDOWN: 5, ATLASDOC: 0, LATEX: 1, CANVAS: 2, MERMAID: 3, GANTT: 1, TODO: 2, TEXT: 4, FILE: 6 },
    pageVersions: 8,
    pageImages: 9,
    collaborationDocuments: 12,
    shares: {
      active: { VIEW: 2, EDIT: 1 },
      revoked: { VIEW: 3, EDIT: 0 },
      expired: { VIEW: 0, EDIT: 4 },
    },
    storage: {
      uploadedFiles: 10n,
      pageImages: 20n,
      collaborationDocuments: 30n,
      profileImages: 40n,
      spaceImages: 50n,
      total: 150n,
    },
  };

  const output = prometheusMetrics(snapshot);
  assert.match(output, /^# HELP atlas_users Number of Atlas user accounts by role and state\.$/m);
  assert.match(output, /^atlas_users\{role="admin",state="active"\} 1$/m);
  assert.match(output, /^atlas_pages\{format="mermaid"\} 3$/m);
  assert.match(output, /^atlas_page_shares\{state="expired",permission="edit"\} 4$/m);
  assert.match(output, /^atlas_storage_bytes\{kind="collaboration_documents"\} 30$/m);
  assert.match(output, /^atlas_metrics_collected_at_seconds 1787659200$/m);
  assert.ok(output.endsWith("\n"));
});

test("the dashboard and endpoint enforce access before collecting aggregate data", () => {
  const dashboard = readFileSync(fileURLToPath(new URL("../src/app/admin/dashboard/page.tsx", import.meta.url)), "utf8");
  const endpoint = readFileSync(fileURLToPath(new URL("../src/app/api/metrics/route.ts", import.meta.url)), "utf8");
  assert.match(dashboard, /requireUser\(\)/);
  assert.match(dashboard, /if \(!canViewInstanceMetrics\(user\)\) redirect/);
  assert.match(dashboard, /collectInstanceMetrics\(\)/);
  assert.match(endpoint, /configuredPrometheusMetricsToken/);
  assert.match(endpoint, /instanceMetricsResponse/);
  assert.match(endpoint, /currentUser: requireApiUser/);
  const collector = readFileSync(fileURLToPath(new URL("../src/lib/instance-metrics.ts", import.meta.url)), "utf8");
  assert.match(collector, /SUM\(octet_length\("data"\)\) FROM "PageAsset"/);
});
