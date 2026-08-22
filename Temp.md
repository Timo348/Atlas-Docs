# Atlas Docs work context

## Branch and local environment

- Current development branch: `dev`.
- Repository: `C:\Users\Timoh\Documents\Atlas\Atlas-Docs`.
- The local Docker Compose stack was built from this branch and is running at `http://localhost:30102`.
- Collaboration WebSocket service runs on port `30103`.
- The administrator account is configured in the untracked `.env` file. Do not commit credentials or copy them into this file.

## Implemented work

### Issue #25: editor line marker

- Text editors show the active cursor line in the left margin.
- The marker is local to the current editor and does not alter document content.

### Issue #30: files and plain text

- Added official `TEXT` and `FILE` page formats.
- UTF-8 `.txt` files and files without an extension import as editable text.
- Unsupported or binary uploads are stored unchanged as read-only downloadable files.
- The sidebar displays a small warning marker for unsupported files.
- Stored files work with page sharing, exports, and downloads.
- Database migration: `20260821110000_text_and_uploaded_files`.

### Mermaid diagrams

- Added `MERMAID` page format, page creator option, sidebar icon, imports for `.mmd` and `.mermaid`, exports, downloads, sharing, and version history.
- Mermaid renders locally in the browser with `securityLevel: "strict"`; click interactions and raw HTML are disabled.
- Excalidraw's online library control is hidden.
- Database migration: `20260821130000_mermaid_file_type`.

### Gantt timelines

- Added `GANTT` page format using the local Mermaid renderer.
- New timelines start with a localized project-plan template.
- `.gantt` import/export and download are supported.
- Database migration: `20260821140000_gantt_file_type`.

### Todo boards

- Added `TODO` page format with a collaborative Yjs-backed Kanban board.
- Columns: New task, Scheduled, In progress, Completed.
- Column headers use blue, yellow, purple, and green accents.
- Tasks support title, priority, deadline, status selection, deletion, and drag-and-drop moves.
- Priorities are Urgent, High, Medium, and Low. Every column sorts higher priority first, then nearest deadline.
- Deadlines show overdue and due-today states.
- Todo pages support shared editing/viewing, snapshots/version restore, download, and portable backup export as `.todos.json`.
- Database migration: `20260821150000_todo_file_type`.

## Key files

- `apps/web/src/components/collaborative-editor.tsx`: page format routing, downloads, history integration.
- `apps/web/src/components/collaborative-mermaid.tsx`: Mermaid and Gantt editor/preview.
- `apps/web/src/components/collaborative-todo-board.tsx`: Todo board interface.
- `apps/web/src/lib/todo-board.ts`: Todo data model, Yjs operations, sorting, export, and snapshot copying.
- `apps/web/src/lib/page-file.ts`: type-specific extensions and import helpers.
- `apps/web/src/lib/collaboration-document.ts`: initial Yjs documents per format.
- `apps/web/src/lib/version-snapshot.ts`: version snapshots for Canvas, text, and Todo.
- `apps/web/src/app/globals.css`: Mermaid, Excalidraw control hiding, and Todo styles.
- `prisma/schema.prisma` and the four migrations above: page format database changes.

## Local demo data

The running local database contains a `Demo-Projekt` space with:

1. `Projektübersicht` (Markdown)
2. `Architektur` (Mermaid)
3. `Releaseplan` (Gantt)
4. `Sprint-Board` (Todo board with sample tasks)

The standard `Start` space and its `Willkommen` page are also seeded.

## Validation completed

- `npm run db:generate`
- `npm run lint`
- `npm run test --workspace=@atlas/web` with 154 passing tests
- `npm run build --workspace=@atlas/web`
- Docker health checks for web and collaboration both returned `ok`.

## Continue on another device

1. Clone or pull branch `dev`.
2. Copy/protect a local `.env` file; never commit it.
3. Install packages with `npm ci`.
4. For a local Docker stack, run:

   ```powershell
   docker compose -f compose.yml -f compose.build.yml up -d --build
   ```

5. For a local Node setup with a reachable PostgreSQL database, run:

   ```powershell
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

6. Check `http://localhost:30102/api/health` and `http://localhost:30103/health` when using the existing local ports.

## Important note

An empty unversioned directory named `prisma/migrations/20260821090000_topology_visibility` blocked Prisma with error `P3015` because it had no `migration.sql`. It was removed locally before migrations were applied. Do not restore that empty directory.
