#!/usr/bin/env bash

set -Eeuo pipefail

umask 077

PROJECT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_ROOT="${ATLAS_BACKUP_DIR:-${PROJECT_DIR}/backups}"
RETENTION_DAYS="${ATLAS_BACKUP_RETENTION_DAYS:-14}"
COMPOSE=(docker compose --project-directory "$PROJECT_DIR")
TEMP_ARTIFACT=""

log() {
  printf '[atlas-backup] %s\n' "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

cleanup() {
  if [[ -n "$TEMP_ARTIFACT" && -e "$TEMP_ARTIFACT" ]]; then
    rm -f -- "$TEMP_ARTIFACT"
  fi
}

select_scheduled_mode() {
  local date_value="${1:-$(date +%F)}"
  local day_of_month weekday

  day_of_month="$(date -d "$date_value" +%d)" || return 1
  weekday="$(date -d "$date_value" +%u)" || return 1

  if [[ "$day_of_month" == "01" || "$day_of_month" == "15" ]]; then
    printf 'archive\n'
  elif [[ "$weekday" == "1" || "$weekday" == "3" || "$weekday" == "5" ]]; then
    printf 'regular\n'
  else
    printf 'skip\n'
  fi
}

prune_regular_backups() {
  local directory="$1"
  local days="$2"

  [[ "$days" =~ ^[0-9]+$ ]] || fail "ATLAS_BACKUP_RETENTION_DAYS must be a non-negative integer."
  [[ -d "$directory" ]] || return 0
  find "$directory" -maxdepth 1 -type f -name 'atlas-docs-*' -mmin "+$((days * 1440))" -delete
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command '$1' was not found."
}

flush_collaboration_documents() {
  local policy="${1:-best-effort}"
  local flush_script
  flush_script='fetch("http://127.0.0.1:1234/internal/flush", { method: "POST", headers: { authorization: `Bearer ${process.env.COLLAB_SECRET}` }, signal: AbortSignal.timeout(30000) }).then(async response => { if (!response.ok) throw new Error(`flush returned ${response.status}`); const result = await response.json(); console.error(`[atlas-backup] Flushed ${result.flushedDocuments} collaboration document(s).`); }).catch(error => { console.error(`[atlas-backup] Collaboration flush failed: ${error.message}`); process.exit(1); });'

  if ! "${COMPOSE[@]}" exec -T collab node -e "$flush_script"; then
    if [[ "$policy" == "required" ]]; then
      fail "Collaboration flush failed; refusing to create an upgrade backup with potentially stale documents."
    fi
    log "WARNING: Continuing with the latest collaboration state already persisted in PostgreSQL."
  fi
}

create_dump() {
  local output="$1"
  local tier="$2"
  local dump_args=(
    --format=custom
    --compress=6
    --no-owner
    --no-privileges
  )

  if [[ "$tier" != "upgrade" ]]; then
    dump_args+=('--exclude-table-data=public."PageVersion"')
  fi
  dump_args+=(
    '--exclude-table-data=public."Session"'
    '--exclude-table-data=public."VerificationToken"'
  )

  "${COMPOSE[@]}" exec -T postgres sh -ec \
    'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" "$@"' sh \
    "${dump_args[@]}" \
    > "$output"

  [[ -s "$output" ]] || fail "pg_dump produced an empty file."
  "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$output" >/dev/null
}

write_metadata() {
  local destination="$1"
  local tier="$2"
  local created="$3"
  local encrypted="$4"

  {
    printf 'created_utc=%s\n' "$created"
    printf 'tier=%s\n' "$tier"
    printf 'format=postgresql-custom\n'
    printf 'encrypted=%s\n' "$encrypted"
    if [[ "$tier" == "upgrade" ]]; then
      printf 'excluded_table_data=Session,VerificationToken\n'
    else
      printf 'excluded_table_data=PageVersion,Session,VerificationToken\n'
    fi
    printf 'images_included=postgresql\n'
    printf 'compose_images_begin\n'
    "${COMPOSE[@]}" config --images
    printf 'compose_images_end\n'
  } > "$destination"
}

run_backup() {
  local tier="$1"
  local regular_dir archive_dir temp_dir destination_dir
  local timestamp base_name dump_temp final_path encrypted metadata_temp checksum_temp

  regular_dir="$BACKUP_ROOT/regular"
  archive_dir="$BACKUP_ROOT/archive"
  temp_dir="$BACKUP_ROOT/.tmp"
  mkdir -p -- "$regular_dir" "$archive_dir" "$temp_dir"
  chmod 0700 "$BACKUP_ROOT" "$regular_dir" "$archive_dir" "$temp_dir"

  exec 9>"$BACKUP_ROOT/.backup.lock"
  flock -n 9 || fail "Another Atlas Docs backup is already running."

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  base_name="atlas-docs-${timestamp}-${tier}"
  destination_dir="$regular_dir"
  [[ "$tier" == "archive" || "$tier" == "upgrade" ]] && destination_dir="$archive_dir"

  dump_temp="$(mktemp "$temp_dir/.${base_name}.dump.XXXXXX")"
  TEMP_ARTIFACT="$dump_temp"

  if [[ "$tier" == "upgrade" ]]; then
    flush_collaboration_documents required
  else
    flush_collaboration_documents
  fi
  log "Creating ${tier} PostgreSQL backup."
  create_dump "$dump_temp" "$tier"

  encrypted="no"
  final_path="$destination_dir/${base_name}.dump"
  if [[ -n "${AGE_RECIPIENT:-}" ]]; then
    require_command age
    local encrypted_temp="${dump_temp}.age"
    age --recipient "$AGE_RECIPIENT" --output "$encrypted_temp" "$dump_temp"
    rm -f -- "$dump_temp"
    TEMP_ARTIFACT="$encrypted_temp"
    final_path="${final_path}.age"
    encrypted="age"
  fi

  mv -- "$TEMP_ARTIFACT" "$final_path"
  TEMP_ARTIFACT=""
  chmod 0600 "$final_path"

  metadata_temp="$(mktemp "$temp_dir/.${base_name}.metadata.XXXXXX")"
  TEMP_ARTIFACT="$metadata_temp"
  write_metadata "$metadata_temp" "$tier" "$timestamp" "$encrypted"
  mv -- "$metadata_temp" "${final_path}.metadata"
  TEMP_ARTIFACT=""
  chmod 0600 "${final_path}.metadata"

  checksum_temp="$(mktemp "$temp_dir/.${base_name}.sha256.XXXXXX")"
  TEMP_ARTIFACT="$checksum_temp"
  (
    cd -- "$destination_dir"
    sha256sum "$(basename -- "$final_path")"
  ) > "$checksum_temp"
  mv -- "$checksum_temp" "${final_path}.sha256"
  TEMP_ARTIFACT=""
  chmod 0600 "${final_path}.sha256"

  prune_regular_backups "$regular_dir" "$RETENTION_DAYS"
  log "Backup completed: $final_path"
}

main() {
  local mode="${1:-scheduled}"
  local dry_run="${2:-}"

  case "$mode" in
    scheduled)
      mode="$(select_scheduled_mode "${ATLAS_BACKUP_DATE:-}")" || fail "ATLAS_BACKUP_DATE must be a valid date."
      ;;
    regular|archive|upgrade)
      ;;
    *)
      fail "Usage: $0 [scheduled|regular|archive|upgrade] [--dry-run]"
      ;;
  esac

  if [[ "$dry_run" == "--dry-run" || "${ATLAS_BACKUP_DRY_RUN:-0}" == "1" ]]; then
    printf '%s\n' "$mode"
    return 0
  fi

  if [[ "$mode" == "skip" ]]; then
    log "No backup is scheduled for today."
    return 0
  fi

  require_command docker
  require_command flock
  require_command sha256sum
  require_command find
  trap cleanup EXIT INT TERM
  run_backup "$mode"
}

if [[ "${ATLAS_BACKUP_SOURCE_ONLY:-0}" == "1" ]]; then
  return 0 2>/dev/null || exit 0
fi

main "$@"
