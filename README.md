# Atlas Docs

Atlas Docs is a self-hosted collaborative knowledge platform for Markdown, LaTeX, and visual workspaces.

## Features

- Real-time Markdown and LaTeX editing with Yjs and Hocuspocus
- Paste images directly from the clipboard with `Ctrl+V`
- Slash commands such as `/table`, `/codeblock`, `/image`, headings, lists, quotes, and links
- Table controls for adding or removing rows and columns
- Markdown and LaTeX previews plus source-file exports
- Shared Excalidraw canvases and live collaborator cursors
- Manual document versions with full text and canvas restoration
- Nested folders, persistent drag-and-drop ordering, spaces, teams, and role-based access
- Local accounts, generic OpenID Connect/Authentik, or both sign-in methods
- Per-user language, color theme, interface font, editor font, text size, compact navigation, and profile image
- English interface by default with an optional German interface

## Production quick start

Requirements:

- A Linux host
- Docker Engine with the Docker Compose plugin
- Two free TCP ports for the web and collaboration services

```bash
git clone https://github.com/Timo348/Atlas-Docs.git
cd Atlas-Docs
cp .env.example .env
editor .env
```

Generate an authentication secret and place it in `AUTH_SECRET`:

```bash
openssl rand -base64 48
```

At minimum, replace these values in `.env`:

```dotenv
AUTH_SECRET=replace-with-the-generated-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
POSTGRES_PASSWORD=replace-with-a-long-random-password
DATABASE_URL=postgresql://atlas:replace-with-a-long-random-password@postgres:5432/atlas
```

Start the pinned release:

```bash
docker compose pull
docker compose up -d --no-build
docker compose ps
```

Atlas Docs is available on `http://SERVER_IP:30002` with the default configuration. The one-shot `migrate` service applies all database migrations before the web and collaboration services start.

## Services

| Service | Purpose | Image |
| --- | --- | --- |
| `web` | Next.js interface, API, authentication, and editors | `timo348/atlas-docs-web` |
| `collab` | Hocuspocus/Yjs collaboration service | `timo348/atlas-docs-collab` |
| `migrate` | Database migrations and initial administrator seed | `timo348/atlas-docs-migrate` |
| `postgres` | Durable application and document data | `postgres:17-alpine` |
| `redis` | Collaboration synchronization and shared runtime state | `redis:7.4-alpine` |

The Compose stack exposes the application services directly. TLS, DNS, firewalls, load balancing, and any edge routing belong to the server administrator's infrastructure and are intentionally not included in this project.

## Configuration

The complete template is in [`.env.example`](.env.example).

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `ATLAS_VERSION` | `1.2.0` | Release tag used for all three Atlas Docs images |
| `APP_URL` | `http://localhost:30002` | Browser-facing web URL |
| `WEB_PORT` | `30002` | Host port for the web service |
| `COLLAB_PORT` | `30003` | Host port for the collaboration service |
| `COLLAB_PUBLIC_URL` | `ws://localhost:30003` | Browser-facing collaboration WebSocket URL |
| `AUTH_MODE` | `local` | `local`, `oidc`, or `both` |
| `AUTH_SECRET` | — | Shared secret for authentication and collaboration tokens |
| `ADMIN_NAME` | `Administrator` | Initial administrator display name |
| `ADMIN_EMAIL` | — | Initial administrator email address |
| `ADMIN_PASSWORD` | — | Initial administrator password |
| `DATABASE_URL` | — | Internal PostgreSQL connection URL |
| `REDIS_URL` | `redis://redis:6379` | Internal Redis connection URL |

`APP_URL` and `COLLAB_PUBLIC_URL` must always be URLs that the user's browser can reach. Use `https://` and `wss://` values when the surrounding server infrastructure terminates TLS.

The initial administrator password is only used when the account does not exist yet.

## Access model

| Role | Read | Edit pages | Manage the space and permissions |
| --- | :---: | :---: | :---: |
| `VIEWER` | Yes | No | No |
| `EDITOR` | Yes | Yes | No |
| `OWNER` | Yes | Yes | Yes |

A user can receive the strongest applicable role directly or through a team. Expired team memberships grant no access. Global administrators manage users and teams.

Page images use the same page-level authorization as the document. Uploaded image bytes are validated by file signature, limited to 5 MB, stored in PostgreSQL, and deleted automatically with their page.

## OpenID Connect / Authentik

1. Create an OAuth2/OpenID Connect provider and application.
2. Register `https://docs.example.com/api/auth/callback/authentik` as the redirect URI.
3. Enable the `openid`, `email`, and `profile` scopes.
4. Configure Atlas Docs:

```dotenv
AUTH_MODE=both
OIDC_ISSUER=https://auth.example.com/application/o/atlas-docs/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

`AUTH_MODE=both` keeps local sign-in available. `AUTH_MODE=oidc` only exposes OpenID Connect sign-in.

## Operations

Update to the release selected by `ATLAS_VERSION`:

```bash
docker compose pull
docker compose up -d --no-build
docker compose ps
```

Inspect logs and health:

```bash
docker compose logs -f web collab migrate
docker compose ps
```

Stop the stack while retaining data:

```bash
docker compose down
```

## Backup and restore

Create a PostgreSQL backup:

```bash
mkdir -p backups
docker compose exec postgres pg_dump -U atlas -d atlas -Fc -f /tmp/atlas.dump
docker compose cp postgres:/tmp/atlas.dump ./backups/atlas.dump
```

Restore into the configured Atlas database:

```bash
docker compose cp ./backups/atlas.dump postgres:/tmp/atlas.dump
docker compose exec postgres pg_restore -U atlas -d atlas --clean --if-exists /tmp/atlas.dump
```

Create a fresh backup before every restore.

## Development and verification

Node.js 22, PostgreSQL, and Redis are required for the local Node.js workflow:

```bash
npm ci
npm run db:generate
npm run lint
npm test
npm run build
```

Build the production images locally:

```bash
docker compose build
```

## Published images

- [Atlas Docs web](https://hub.docker.com/r/timo348/atlas-docs-web)
- [Atlas Docs collaboration](https://hub.docker.com/r/timo348/atlas-docs-collab)
- [Atlas Docs migrations](https://hub.docker.com/r/timo348/atlas-docs-migrate)
