import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const migration = readFileSync(
  fileURLToPath(new URL("../../../prisma/migrations/20260823110000_migrate_legacy_pdf_assets/migration.sql", import.meta.url)),
  "utf8",
);

test("the legacy PDF migration imports document assets only when the old table exists", () => {
  assert.match(migration, /to_regclass\('public\."PageAsset"'\)/);
  assert.match(migration, /asset\."kind"::text = 'DOCUMENT'/);
  assert.match(migration, /page\."fileData" IS NULL/);
  assert.match(migration, /"fileMime" = COALESCE\(NULLIF\(asset\."mime", ''\), 'application\/pdf'\)/);
});
