import { createHash, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export const METRICS_PATH = "/api/metrics";
export const PROMETHEUS_METRICS_TOKEN_ENV = "PROMETHEUS_METRICS_TOKEN";
export const MIN_PROMETHEUS_METRICS_TOKEN_LENGTH = 32;

export const PAGE_FORMATS = [
  "MARKDOWN",
  "ATLASDOC",
  "LATEX",
  "CANVAS",
  "MERMAID",
  "GANTT",
  "TODO",
  "TEXT",
  "FILE",
] as const;

export type AtlasPageFormat = typeof PAGE_FORMATS[number];
export type AtlasUserRole = "ADMIN" | "MEMBER";
export type AtlasUserState = "active" | "inactive";
export type AtlasSharePermission = "VIEW" | "EDIT";
export type AtlasShareState = "active" | "revoked" | "expired";
export type AtlasStorageKind = "uploadedFiles" | "pageImages" | "collaborationDocuments" | "profileImages" | "spaceImages";

export type InstanceMetrics = {
  collectedAt: Date;
  users: Record<AtlasUserRole, Record<AtlasUserState, number>>;
  spaces: number;
  folders: number;
  pages: Record<AtlasPageFormat, number>;
  pageVersions: number;
  pageImages: number;
  collaborationDocuments: number;
  shares: Record<AtlasShareState, Record<AtlasSharePermission, number>>;
  storage: Record<AtlasStorageKind, bigint> & { total: bigint };
};

type StorageRow = Record<AtlasStorageKind, bigint | number | string | null>;
type MetricsDatabase = Pick<PrismaClient,
  "$queryRaw" | "collabDocument" | "folder" | "page" | "pageImage" | "pageShare" | "pageVersion" | "space" | "user"
>;

const userRoles: AtlasUserRole[] = ["ADMIN", "MEMBER"];
const userStates: AtlasUserState[] = ["active", "inactive"];
const sharePermissions: AtlasSharePermission[] = ["VIEW", "EDIT"];
const shareStates: AtlasShareState[] = ["active", "revoked", "expired"];

export function configuredPrometheusMetricsToken(value = process.env[PROMETHEUS_METRICS_TOKEN_ENV]) {
  const token = value?.trim() || "";
  return token.length >= MIN_PROMETHEUS_METRICS_TOKEN_LENGTH ? token : null;
}

export function hasPrometheusMetricsToken(value = process.env[PROMETHEUS_METRICS_TOKEN_ENV]) {
  return configuredPrometheusMetricsToken(value) !== null;
}

export function hasPrometheusMetricsAuthorization(authorization: string | null, expectedToken: string | null) {
  if (!authorization || !expectedToken) return false;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) return false;
  return timingSafeEqual(tokenDigest(match[1]), tokenDigest(expectedToken));
}

export function shareState(
  share: { revokedAt: Date | null; expiresAt: Date | null },
  now = new Date(),
): AtlasShareState {
  if (share.revokedAt) return "revoked";
  if (share.expiresAt && share.expiresAt <= now) return "expired";
  return "active";
}

export async function collectInstanceMetrics(client: MetricsDatabase = db): Promise<InstanceMetrics> {
  const now = new Date();
  const [userGroups, pageGroups, spaces, folders, pageVersions, pageImages, collaborationDocuments, shares, storageRows] = await Promise.all([
    client.user.groupBy({ by: ["role", "active"], _count: { _all: true } }),
    client.page.groupBy({ by: ["format"], _count: { _all: true } }),
    client.space.count(),
    client.folder.count(),
    client.pageVersion.count(),
    client.pageImage.count(),
    client.collabDocument.count(),
    client.pageShare.findMany({ select: { permission: true, revokedAt: true, expiresAt: true } }),
    client.$queryRaw<StorageRow[]>`
      SELECT
        COALESCE((SELECT SUM(octet_length("fileData")) FROM "Page" WHERE "fileData" IS NOT NULL), 0)::bigint AS "uploadedFiles",
        COALESCE((SELECT SUM(octet_length("data")) FROM "PageImage"), 0)::bigint AS "pageImages",
        COALESCE((SELECT SUM(octet_length("data")) FROM "CollabDocument"), 0)::bigint AS "collaborationDocuments",
        COALESCE((SELECT SUM(octet_length("avatarData")) FROM "User" WHERE "avatarData" IS NOT NULL), 0)::bigint AS "profileImages",
        COALESCE((SELECT SUM(octet_length("imageData")) FROM "Space" WHERE "imageData" IS NOT NULL), 0)::bigint AS "spaceImages"
    `,
  ]);

  const users = emptyUsers();
  for (const group of userGroups) {
    if (group.role !== "ADMIN" && group.role !== "MEMBER") continue;
    users[group.role][group.active ? "active" : "inactive"] = group._count._all;
  }

  const pages = emptyPageFormats();
  for (const group of pageGroups) {
    if (isPageFormat(group.format)) pages[group.format] = group._count._all;
  }

  const shareMetrics = emptyShares();
  for (const share of shares) {
    if (share.permission !== "VIEW" && share.permission !== "EDIT") continue;
    shareMetrics[shareState(share, now)][share.permission] += 1;
  }

  const source = storageRows[0];
  const storage = {
    uploadedFiles: toBigInt(source?.uploadedFiles),
    pageImages: toBigInt(source?.pageImages),
    collaborationDocuments: toBigInt(source?.collaborationDocuments),
    profileImages: toBigInt(source?.profileImages),
    spaceImages: toBigInt(source?.spaceImages),
  };

  return {
    collectedAt: now,
    users,
    spaces,
    folders,
    pages,
    pageVersions,
    pageImages,
    collaborationDocuments,
    shares: shareMetrics,
    storage: {
      ...storage,
      total: Object.values(storage).reduce((total, size) => total + size, 0n),
    },
  };
}

export function prometheusMetrics(snapshot: InstanceMetrics) {
  const lines = [
    "# HELP atlas_users Number of Atlas user accounts by role and state.",
    "# TYPE atlas_users gauge",
  ];
  for (const role of userRoles) {
    for (const state of userStates) {
      lines.push(metric("atlas_users", { role: role.toLowerCase(), state }, snapshot.users[role][state]));
    }
  }

  lines.push(
    "# HELP atlas_spaces Number of Atlas spaces.",
    "# TYPE atlas_spaces gauge",
    metric("atlas_spaces", {}, snapshot.spaces),
    "# HELP atlas_folders Number of Atlas folders.",
    "# TYPE atlas_folders gauge",
    metric("atlas_folders", {}, snapshot.folders),
    "# HELP atlas_pages Number of Atlas pages by file format.",
    "# TYPE atlas_pages gauge",
  );
  for (const format of PAGE_FORMATS) {
    lines.push(metric("atlas_pages", { format: format.toLowerCase() }, snapshot.pages[format]));
  }

  lines.push(
    "# HELP atlas_page_versions Number of saved Atlas page versions.",
    "# TYPE atlas_page_versions gauge",
    metric("atlas_page_versions", {}, snapshot.pageVersions),
    "# HELP atlas_page_images Number of stored Atlas page images.",
    "# TYPE atlas_page_images gauge",
    metric("atlas_page_images", {}, snapshot.pageImages),
    "# HELP atlas_collaboration_documents Number of persisted collaboration documents.",
    "# TYPE atlas_collaboration_documents gauge",
    metric("atlas_collaboration_documents", {}, snapshot.collaborationDocuments),
    "# HELP atlas_page_shares Number of Atlas page share links by state and permission.",
    "# TYPE atlas_page_shares gauge",
  );
  for (const state of shareStates) {
    for (const permission of sharePermissions) {
      lines.push(metric("atlas_page_shares", { state, permission: permission.toLowerCase() }, snapshot.shares[state][permission]));
    }
  }

  lines.push(
    "# HELP atlas_storage_bytes Bytes stored by Atlas data category.",
    "# TYPE atlas_storage_bytes gauge",
  );
  for (const kind of ["uploadedFiles", "pageImages", "collaborationDocuments", "profileImages", "spaceImages"] as AtlasStorageKind[]) {
    lines.push(metric("atlas_storage_bytes", { kind: prometheusLabel(kind) }, snapshot.storage[kind]));
  }
  lines.push(
    metric("atlas_storage_bytes", { kind: "total" }, snapshot.storage.total),
    "# HELP atlas_metrics_collected_at_seconds Unix timestamp of the current Atlas metrics snapshot.",
    "# TYPE atlas_metrics_collected_at_seconds gauge",
    metric("atlas_metrics_collected_at_seconds", {}, Math.floor(snapshot.collectedAt.getTime() / 1000)),
  );

  return `${lines.join("\n")}\n`;
}

function tokenDigest(value: string) {
  return createHash("sha256").update(value).digest();
}

function metric(name: string, labels: Record<string, string>, value: number | bigint) {
  const labelEntries = Object.entries(labels);
  const suffix = labelEntries.length
    ? `{${labelEntries.map(([key, label]) => `${key}="${escapeLabel(label)}"`).join(",")}}`
    : "";
  return `${name}${suffix} ${value}`;
}

function escapeLabel(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, "\\\"");
}

function emptyUsers(): InstanceMetrics["users"] {
  return {
    ADMIN: { active: 0, inactive: 0 },
    MEMBER: { active: 0, inactive: 0 },
  };
}

function emptyPageFormats(): InstanceMetrics["pages"] {
  return Object.fromEntries(PAGE_FORMATS.map((format) => [format, 0])) as InstanceMetrics["pages"];
}

function emptyShares(): InstanceMetrics["shares"] {
  return {
    active: { VIEW: 0, EDIT: 0 },
    revoked: { VIEW: 0, EDIT: 0 },
    expired: { VIEW: 0, EDIT: 0 },
  };
}

function isPageFormat(value: string): value is AtlasPageFormat {
  return PAGE_FORMATS.includes(value as AtlasPageFormat);
}

function toBigInt(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") return value >= 0n ? value : 0n;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.max(0, Math.trunc(value)));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function prometheusLabel(value: AtlasStorageKind) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
