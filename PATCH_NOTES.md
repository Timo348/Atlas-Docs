# Atlas Docs Patch Notes

## 3.1.0 – Focused Todo creation and Markdown descriptions

Released on August 31, 2026.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v3.1.0) ·
[Setup and upgrade guide](SETUP.md#upgrade-to-310) · [End-user guide](UsageGuide.md)

- **Focused task creation:** **Add task** now opens one dialog for the title,
  Markdown description, status, priority, and deadline instead of requiring a
  title before the remaining fields are available.
- **Markdown task descriptions:** Every Todo task can store a 12,000-character
  Markdown description. The dialog renders a live GFM preview and each card
  shows the rendered description; the edit control reopens the same dialog.

### Upgrade notes from 3.0.0

1. Create the usual `upgrade` backup, then use the release files from tag
   `v3.1.0`. Preserve the existing secret `.env`; never overwrite it with
   `.env.example`.
2. Set the exact matching service version:

   ```dotenv
   ATLAS_VERSION=3.1.0
   ```

3. No new environment variable, Compose service, or database migration is
   required. Existing Todo tasks remain valid and simply have an empty
   description until edited.
4. Validate and start the complete matching service set:

   ```bash
   docker compose config --quiet
   docker compose pull
   docker compose up -d --no-build
   docker compose ps -a
   docker compose logs --no-color migrate
   ```

Matching Linux/amd64 `web`, `collab`, and `migrate` images are published in
GHCR and Docker Hub as `3.1.0`, `3.1`, `3`, and `latest`. Keep all three
services on the same tag.

Completed issues:

- [#35 – PopUp für Task Erstellung](https://github.com/Timo348/Atlas-Docs/issues/35)
- [#36 – Beschreibung ToDos](https://github.com/Timo348/Atlas-Docs/issues/36)

## 3.0.0 – Central settings, visual planning, and observability

Released on August 25, 2026.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v3.0.0) ·
[Setup and upgrade guide](SETUP.md#upgrade-to-300) · [End-user guide](UsageGuide.md)

Atlas Docs 3.0.0 combines the 2.1 file and sharing workflow with a substantially
broader workspace experience:

- **Central Settings page:** Account profile and local-password management,
  design choices, workspace defaults, per-file opening views, Gantt appearance,
  and personal/admin exports are collected under `/settings`.
- **File-specific behavior:** Markdown and LaTeX can open in writing/source or
  preview mode; Mermaid and Gantt files open in their relevant diagram/planner
  view. The setting applies when a file is next opened.
- **More first-class files:** Markdown, LaTeX, Canvas, Mermaid, Gantt, Todo,
  plain text, PDFs, and other uploaded files coexist in one workspace. Browser-
  native previews keep PDFs, images, audio, and video viewable without changing
  the original data.
- **Focused file work:** Every file viewer supports the same full-screen mode;
  the workspace navigation disappears and the control turns into the matching
  exit action.
- **Visual Gantt planner:** Create tasks without Mermaid syntax, set inclusive
  start and end dates, drag or resize bars, double-click to edit, import a
  Mermaid Gantt plan, jump to today, and configure status labels/colors plus
  past-date dimming in Settings.
- **Instance operations:** Administrators receive an instance dashboard. A
  separate bearer-protected `/api/metrics` endpoint exposes aggregate Prometheus
  data for Grafana without exposing workspace content or user secrets.

### Upgrade notes from 2.1.0

1. Schedule a maintenance window, create an `upgrade` backup, and stop `web`
   and `collab` as described in [the safe upgrade procedure](SETUP.md#standard-safe-upgrade).
2. Replace the release deployment files with the copies from tag `v3.0.0`.
   Keep the existing secret `.env`; never overwrite it with `.env.example`.
3. Merge the Compose changes into `.env` before starting the target:

   ```dotenv
   # Official 3.0.0 image location and exact matching tag
   ATLAS_IMAGE_REGISTRY=ghcr.io/timo348
   ATLAS_VERSION=3.0.0

   # Optional: a separate random bearer value of at least 32 characters.
   # Leave empty to keep /api/metrics disabled.
   PROMETHEUS_METRICS_TOKEN=
   ```

   `ATLAS_UPLOAD_MAX_MB` remains unchanged from 2.1.0. Operators using an
   internal registry may retain it, but it must provide all three matching
   3.0.0 images.
4. Validate, pull, and start the complete matching service set:

   ```bash
   docker compose config --quiet
   docker compose pull
   docker compose up -d --no-build
   docker compose ps -a
   docker compose logs --no-color migrate
   ```

The migration service adds file-format and user-preference data, then
normalizes older PDF metadata for the current file workflow. Database rollback
requires the pre-upgrade backup; selecting an older image tag alone does not
reverse these schema or data changes.

Matching Linux/amd64 images are published in GHCR as `3.0.0`, `3.0`, `3`, and
`latest` for `atlas-docs-web`, `atlas-docs-collab`, and `atlas-docs-migrate`.
Keep all three services on the same tag.

## 2.1.0 – Folder sharing, PDFs, imports, and export

Released on August 19, 2026.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v2.1.0) ·
[Setup and upgrade guide](SETUP.md) · [End-user guide](UsageGuide.md)

Atlas Docs 2.1 expands the file workflow and public sharing model:

- Space owners and administrators can share a folder through a hashed link.
  The link includes its nested folders and files, follows later moves into or
  out of that folder, and supports read-only or content-editing access, expiry,
  permission changes, and revocation.
- PDF files can be imported as standalone pages, viewed, downloaded, shared,
  and included in portable backups. Markdown pages can also contain uploaded
  PDF attachments without exposing them outside the page or folder share.
- New-file creation accepts `.md`, `.tex`, `.excalidraw`, and `.pdf` imports.
- Markdown and LaTeX documents can use the browser print workflow for PDF
  export with a dedicated A4 print layout.
- One MB-based `ATLAS_UPLOAD_MAX_MB` setting controls supported image, import,
  and PDF attachment uploads. The default is 25 MB.

### Upgrade notes from 2.0.2

1. Create an upgrade backup and stop application writes as documented in
   [the safe upgrade procedure](SETUP.md#standard-safe-upgrade).
2. Replace the release deployment files with the copies from tag `v2.1.0`.
   Keep the installation's secret `.env`; do not overwrite it with
   `.env.example`.
3. Merge this new setting into `.env` if a different limit is desired:

   ```dotenv
   ATLAS_UPLOAD_MAX_MB=25
   ```

   Omitting it keeps the 25 MB Compose default.
4. Set `ATLAS_VERSION=2.1.0`, then validate, pull, and start all matching
   services:

   ```bash
   docker compose config --quiet
   docker compose pull
   docker compose up -d --no-build
   docker compose ps -a
   docker compose logs --no-color migrate
   ```

The release adds additive `PageAsset`, PDF page-format, and `FolderShare`
database migrations. The one-shot `migrate` service applies them before the web
and collaboration services start. A database rollback still requires restoring
the pre-upgrade backup; changing only image tags is not a schema rollback.

Matching Linux/amd64 `web`, `collab`, and `migrate` images are published on
Docker Hub with the tags `2.1.0`, `2.1`, `2`, and `latest`. Keep all three Atlas
services on the same tag.

Completed issues:

- [#8 – Seiten Teilen](https://github.com/Timo348/Atlas-Docs/issues/8)
- [#9 – Ordner Teilen](https://github.com/Timo348/Atlas-Docs/issues/9)
- [#20 – PDF Dateityp](https://github.com/Timo348/Atlas-Docs/issues/20)
- [#24 – File Size Upload](https://github.com/Timo348/Atlas-Docs/issues/24)
- [#27 – PDF Export](https://github.com/Timo348/Atlas-Docs/issues/27)
- [#28 – Import File](https://github.com/Timo348/Atlas-Docs/issues/28)


## 2.0.2 – Clearer Markdown previews

Released on August 19, 2026.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v2.0.2) ·
[Setup and upgrade guide](SETUP.md) · [End-user guide](UsageGuide.md)

Markdown previews are now easier to scan on both wide and small screens.

- Fenced Java, Python, C, C#, C++, and Bash code blocks use deterministic
  syntax highlighting. Common aliases such as `py`, `cs`, `c#`, `c++`, and
  `sh` resolve to the same supported language definitions.
- Preview links use the theme accent color, a persistent underline, and a
  stronger hover/focus treatment.
- The reading area grows up to 1,120 px and uses the full available width on
  narrower screens. Mobile padding drops to 22 px without introducing page-
  level horizontal scrolling; long code lines and tables scroll inside their
  own content area.

The patch does not change the database schema and needs no content migration.
Deployment images are published for Linux/amd64 as `2.0.2`, `2.0`, `2`, and
`latest` on Docker Hub. All Atlas services in one deployment must use matching
versions.

Completed issues:

- [#7 – Syntax Highlight](https://github.com/Timo348/Atlas-Docs/issues/7)
- [#23 – Farbig Markieren](https://github.com/Timo348/Atlas-Docs/issues/23)
- [#26 – Seitengröße Erhöhen](https://github.com/Timo348/Atlas-Docs/issues/26)

Verification covered 152 web tests, 4 collaboration-service tests, TypeScript
checks, the optimized Next.js production build, all three production container
builds, and desktop/mobile browser checks against the running stack.

## 2.0.1 – Configurable start space

Released on August 18, 2026.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v2.0.1) ·
[Setup and upgrade guide](SETUP.md) · [End-user guide](UsageGuide.md)

Users can now choose the space Atlas opens when the application is visited
without a direct page or space link. The new **Start space** preference is
available under **Profile & settings** and follows the account across devices.

- Direct `?page=` and `?space=` links continue to take priority.
- Only currently accessible spaces can be saved through the preferences API.
- Direct and active team-based space grants are both supported.
- Revoked or expired access falls back safely to the first accessible space.
- Deleting the configured space automatically clears the preference.
- Selecting **Automatic** preserves the original first-accessible-space
  behavior.

The patch includes a small additive database migration for the nullable
`User.defaultSpaceId` relation. Existing users keep the automatic behavior, and
no content migration is required.

Deployment images are published for Linux/amd64 as `2.0.1`, `2.0`, `2`, and
`latest` in Docker Hub and GHCR. All Atlas services in one deployment must use
matching versions.

Completed issue:
[\#18 – Standard Space](https://github.com/Timo348/Atlas-Docs/issues/18).

## 2.0.0

Released on August 18, 2026.

Atlas Docs 2.0 turns the project into a broader collaborative workspace. The
release introduces standalone visual files, page-specific sharing, safer
upgrades, stronger workspace navigation, and a more polished writing
experience while preserving the self-hosted operating model.

[GitHub release](https://github.com/Timo348/Atlas-Docs/releases/tag/v2.0.0) ·
[Setup and upgrade guide](SETUP.md) · [End-user guide](UsageGuide.md)

## Highlights

### Standalone Canvas files

Canvas is now a first-class file type beside Markdown and LaTeX. Excalidraw
canvases have their own page, live collaboration session, version history,
download, deletion flow, and page-sharing controls.

During an upgrade, Atlas detects meaningful canvas content embedded in legacy
text pages and creates a new Canvas file beside the source page. The migration
is additive and idempotent: it copies current canvas state and available canvas
versions without deleting the legacy source data.

### Share one page instead of a complete space

Space owners and instance administrators can create a link for one page only.
Each link supports:

- read-only or content-only editing access;
- expiry after 7, 30, or 90 days, or no automatic expiry;
- permission changes and immediate revocation;
- live Markdown, LaTeX, or Canvas collaboration without an Atlas account.

An editing link cannot rename the page, upload images, manage versions, browse
the containing space, or change permissions. Full share secrets are displayed
once and stored only as SHA-256 hashes.

### Faster writing and navigation

- Markdown buttons for bold, italic, strikethrough, inline code, and links.
- `Ctrl/Cmd+B`, `Ctrl/Cmd+I`, and `Ctrl/Cmd+K` formatting shortcuts.
- `Tab` and `Shift+Tab` indentation with a keyboard-focus escape path.
- Arrow-key navigation across visual Markdown table cells.
- `Ctrl/Cmd+Shift+N` to create a file.
- `Ctrl/Cmd+Shift+K` to switch spaces.
- Middle-click and `Ctrl/Cmd+click` support for opening pages and spaces in a
  new browser tab.
- `Escape` closes only the topmost available dialog and respects busy states.

### More control over workspaces

- Delete individual pages and canvases from the navigation tree.
- Rename spaces without changing their links or stored content.
- Delete a space only after entering its exact name.
- Manage direct user grants and team-based access from one dialog.
- Use `OWNER`, `EDITOR`, and `VIEWER` roles with the strongest active grant
  taking effect.

### Personal workspace preferences

Every account can select its language, light/dark/system theme, interface font,
editor font, text size, navigation density, profile image, and default
Write/Preview document view. Preferences follow the account across devices.

## Portability and recovery

- Native `.md`, `.tex`, and `.excalidraw` downloads.
- User-scoped and administrator instance-wide portable ZIP exports.
- Standalone Canvas files in portable export manifest version 2.
- A dedicated `upgrade` backup tier that retains page-version history.
- Conservative per-page handling of malformed legacy Yjs canvas data while
  infrastructure and database failures remain fatal.
- A documented, verified PostgreSQL restore procedure.

Portable exports are content snapshots, not full server backups. They omit
accounts, permissions, sessions, and version history. Use the PostgreSQL backup
procedure for disaster recovery or an upgrade rollback.

## Security and deployment

- Page-scoped, short-lived collaboration tokens with explicit read-only state.
- Public page-link sessions are revalidated after permission changes or
  revocation.
- Uploaded page images keep page authorization, signature validation, and a
  5 MB limit.
- Web, collaboration, and migration containers run as the non-root `node` user.
- Docker Compose drops Linux capabilities and enables `no-new-privileges` for
  Atlas application services.
- Self-hosted Excalidraw assets and LaTeX fonts remain available without a
  public asset CDN.

Atlas Docs does not claim end-to-end encryption, zero-knowledge storage, or
automatic off-site backups. TLS, proxy configuration, firewall policy, and
backup replication remain operator responsibilities.

## Documentation and presentation

- New application favicon.
- Reworked project README with a screenshot-driven product tour.
- Separate installation and operations guide in `SETUP.md`.
- German end-user guide with shortcuts in `UsageGuide.md`.
- Updated deployment, upgrade, backup, restore, air-gap, and troubleshooting
  instructions.

## Upgrade notes

1. Read the [complete upgrade procedure](SETUP.md#upgrading).
2. Create the history-preserving upgrade backup before changing images:

   ```bash
   ./backup.sh upgrade
   ```

3. Stop web and collaboration editing during the database migration.
4. Set `ATLAS_VERSION=2.0.0` and pull all three matching Atlas images.
5. Start the stack and verify the migration service before reopening access.

The release adds the `CANVAS` page format and new database fields. Atlas Docs
1.5.x does not understand the new schema, so a binary downgrade is not a safe
rollback. Restore the pre-upgrade PostgreSQL backup as part of any rollback
plan.

## Published container tags

The following Linux/amd64 images are available with the tags `2.0.0`, `2.0`,
`2`, and `latest`:

- `docker.io/timo348/atlas-docs-web`
- `docker.io/timo348/atlas-docs-collab`
- `docker.io/timo348/atlas-docs-migrate`

All 2.0.0 images carry OCI version and source-revision metadata for commit
`c9fa8f21accedcdf20317a82639507b3a82efe34`.

## Completed issues

- [#2 – Dark Mode Überarbeiten](https://github.com/Timo348/Atlas-Docs/issues/2)
- [#3 – Teams](https://github.com/Timo348/Atlas-Docs/issues/3)
- [#5 – Seiten und Spaces in einem neuen Tab](https://github.com/Timo348/Atlas-Docs/issues/5)
- [#6 – Hotkeys](https://github.com/Timo348/Atlas-Docs/issues/6)
- [#8 – Einzelne Seiten teilen](https://github.com/Timo348/Atlas-Docs/issues/8)
- [#10 – Canvas als eigener Dateityp](https://github.com/Timo348/Atlas-Docs/issues/10)
- [#11 – Konfigurierbare Standardansicht](https://github.com/Timo348/Atlas-Docs/issues/11)
- [#13 – Formatierungsbuttons im Schreibmodus](https://github.com/Timo348/Atlas-Docs/issues/13)
- [#14 – Hyperlinks](https://github.com/Timo348/Atlas-Docs/issues/14)

## Verification

The 2.0.0 release passed:

- 142 web tests;
- 4 collaboration-service tests;
- TypeScript checks for web and collaboration;
- Prisma schema validation;
- the optimized Next.js production build;
- all three production container builds.

The release commit was created by a local Codex-assisted automation at
14:00:00 Europe/Berlin. No GitHub Actions workflow was used for publishing.
