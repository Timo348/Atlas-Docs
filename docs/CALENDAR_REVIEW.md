# Calendar review for 3.3.0

The calendar keeps personal entries owner-scoped and projects shared Todo boards
into SQL. Yjs remains the source of truth for Space tasks. Calendar task writes
connect to the original board and require confirmation from the durable index.

## Validation

- `npm test`: 275 passing tests across the shared Todo module, web and Collab.
  Coverage includes recurrence at month ends and leap years, both Berlin clock
  changes, date-only deadlines, moved exceptions, split counts, separate
  occurrence completion, preserved assignments and concurrent snapshot merges.
- `npm run lint` and `npm run build`: all three workspaces type-check and build
  successfully. All three production Docker targets also build successfully.
- `scripts/todo-index-integration.ts`: real PostgreSQL transactions verify
  idempotent backfill, empty versus pending boards, damaged-byte preservation,
  atomic rollback, restoration/deletion, board and Space cascades, and the
  composite board/Space foreign key.
- `scripts/calendar-collab-integration.ts`: actual WebSocket providers verify
  concurrent edits and durable index equality, deadline removal, task completion
  rules, invalid assignees, viewer denial, connected writer revocation and expired
  team membership. A concurrent dependency/assignment regression reproduces the
  original race and confirms atomic validation/application rejects the second
  cyclic update. Live task deletion and restoration preserve assignments and
  remove stale index rows. Read-only public tokens retain their limit after
  share upgrades.
- `scripts/calendar-smoke.cjs`: real browser and API checks cover private data
  isolation, foreign IDs, recurrence mutations, saved filters after login,
  original-board editing, conflicts and retained drafts, legacy Todo visibility,
  archived Gantt files and current Space permissions. A stalled persistence
  response reaches the 30-second save limit and retains the entered draft.
  All four views and their period controls work. Desktop and mobile each pass
  English/German and light/dark checks; mobile starts in agenda, and its source
  panel and appointment dialog fit the viewport without horizontal overflow.
  An additional real pointer drag moves a Space deadline from September 30 to
  October 1, confirms it in SQL, and opens the exact highlighted task in its board.
- `scripts/calendar-export-integration.cjs`: both portable ZIP scopes contain
  only the requesting user's private calendar. Todo export/import preserves
  assignments and dependencies, invalid imports leave no partial page, and a
  full PostgreSQL dump includes calendar data for both fixture owners.
- `scripts/browser-smoke.cjs`: existing AtlasDoc, Markdown and text editing,
  Undo/Redo, navigation and Metrics grant/revocation scenarios pass without
  browser errors.
- `bash scripts/backup.test.sh`: backup scheduling and retention checks pass.

The upgrade test starts with the published 3.2.0 images and existing dated,
undated, empty and damaged Todo boards plus a Gantt file. A database dump is
restored into an isolated QA database before the finalized additive migration
and 3.3.0 services run. Original tasks remain unassigned, empty boards become
indexed, damaged bytes remain intact and migration exits successfully with a
visible recovery diagnostic. Re-running the migration is idempotent.

The integration scripts require a disposable localhost instance. The database
scripts also require `ATLAS_TEST_DATABASE=1`; do not run them against production.
Local credentials, database dumps and screenshots stay outside Git and Docker
build contexts.

## Query limits

Requested periods are limited to 366 days, with at most 5,000 dated events and
5,000 personal entry records. An appointment can span up to 31 days. The undated
and overdue overviews each show at most 1,000 tasks and report truncation.
Recurring overdue Todos look back 366 days; the overview reports when older
occurrences may be omitted. Non-recurring overdue Todos retain their full age.

Recurring local wall times resolve with Temporal's compatible daylight-saving
behavior. New ambiguous or nonexistent local times entered in the browser
require correction; existing recurring values are preserved when editing text.

Reminders, external calendar synchronization, shared private appointments and
planned work intervals remain outside this release's scope.
