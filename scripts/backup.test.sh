#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

expect_mode() {
  local date_value="$1"
  local expected="$2"
  local actual
  actual="$(ATLAS_BACKUP_DATE="$date_value" "$ROOT_DIR/backup.sh" scheduled --dry-run)"
  [[ "$actual" == "$expected" ]] || {
    printf 'Expected %s for %s, got %s\n' "$expected" "$date_value" "$actual" >&2
    exit 1
  }
}

expect_mode 2026-08-03 regular
expect_mode 2026-08-05 regular
expect_mode 2026-08-07 regular
expect_mode 2026-08-01 archive
expect_mode 2026-08-15 archive
expect_mode 2026-08-04 skip

[[ "$("$ROOT_DIR/backup.sh" upgrade --dry-run)" == "upgrade" ]]

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
mkdir -p "$test_root/regular" "$test_root/archive"
touch -d '16 days ago' "$test_root/regular/atlas-docs-old.dump"
touch -d '16 days ago' "$test_root/regular/not-an-atlas-backup.txt"
touch -d '120 days ago' "$test_root/archive/atlas-docs-archive.dump"
touch "$test_root/regular/atlas-docs-current.dump"

ATLAS_BACKUP_SOURCE_ONLY=1 source "$ROOT_DIR/backup.sh"
prune_regular_backups "$test_root/regular" 14

[[ ! -e "$test_root/regular/atlas-docs-old.dump" ]]
[[ -e "$test_root/regular/not-an-atlas-backup.txt" ]]
[[ -e "$test_root/regular/atlas-docs-current.dump" ]]
[[ -e "$test_root/archive/atlas-docs-archive.dump" ]]

printf 'backup.sh tests passed\n'
