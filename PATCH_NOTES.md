# Atlas Docs Patch Notes

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
