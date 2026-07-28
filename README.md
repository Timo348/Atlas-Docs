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
- Owner/admin space deletion with exact-name confirmation and complete content cleanup
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

For access from another computer, also replace `localhost` in `APP_URL` with the
server's LAN address or DNS name. Leave `COLLAB_PUBLIC_URL` empty for a direct
installation; Atlas then uses the hostname opened in the browser and
`COLLAB_PORT` automatically.

Start the pinned release. The production Compose file is image-only and never
builds source code on the target host:

```bash
docker compose pull
docker compose up -d --no-build
docker compose ps
```

Atlas Docs is available on `http://SERVER_IP:30002` with the default configuration. The one-shot `migrate` service applies all database migrations before the web and collaboration services start.

## Registry-only and offline deployment

Atlas Docs does not require public internet access at runtime. All browser assets,
including the complete Excalidraw and LaTeX font sets, are served by the web
container. The application only talks to PostgreSQL, Redis, the collaboration
service, and, when enabled, your configured internal OIDC provider.

The default image source is Docker Hub. To use the identical GHCR release, set:

```bash
ATLAS_IMAGE_REGISTRY=ghcr.io/timo348
```

An internal registry or pull-through cache can be selected without editing
Compose. Set `ATLAS_IMAGE_REGISTRY`, `POSTGRES_IMAGE`, and `REDIS_IMAGE` to the
paths used by that registry. The defaults only reference Docker Hub; the Atlas
application images are also published to GHCR.

For a registry-connected server, pull while registry access is available and
then start with pulls and builds disabled:

```bash
docker compose pull
docker compose -f compose.yml -f compose.airgap.yml up -d --no-build
docker compose ps
```

For a physically disconnected server, prepare a bundle on a connected machine:

```bash
cp .env.example .env
# Edit .env before resolving the exact image list.
docker compose config --images > atlas-docs-1.3.0-images.txt
xargs -a atlas-docs-1.3.0-images.txt -n 1 docker pull
docker save -o atlas-docs-1.3.0-offline.tar $(cat atlas-docs-1.3.0-images.txt)
sha256sum atlas-docs-1.3.0-offline.tar > atlas-docs-1.3.0-offline.tar.sha256
```

Transfer the archive, checksum, `compose.yml`, `compose.airgap.yml`, and `.env`.
Then load and start without any network access:

```bash
sha256sum -c atlas-docs-1.3.0-offline.tar.sha256
docker load -i atlas-docs-1.3.0-offline.tar
docker compose -f compose.yml -f compose.airgap.yml up -d --no-build
docker compose ps
```

Set `APP_URL` to the server's reachable LAN URL and keep
`COLLAB_PUBLIC_URL=` empty. Ports `WEB_PORT` and `COLLAB_PORT` must be reachable
from the local network. No public DNS or internet connection is required.

## Services

| Service | Purpose | Image |
| --- | --- | --- |
| `web` | Next.js interface, API, authentication, and editors | `${ATLAS_IMAGE_REGISTRY}/atlas-docs-web` |
| `collab` | Hocuspocus/Yjs collaboration service | `${ATLAS_IMAGE_REGISTRY}/atlas-docs-collab` |
| `migrate` | Database migrations and initial administrator seed | `${ATLAS_IMAGE_REGISTRY}/atlas-docs-migrate` |
| `postgres` | Durable application and document data | `${POSTGRES_IMAGE}` |
| `redis` | Collaboration synchronization and shared runtime state | `${REDIS_IMAGE}` |

The Compose stack exposes the application services directly. TLS, DNS, firewalls, load balancing, and any edge routing belong to the server administrator's infrastructure and are intentionally not included in this project.

## Configuration

The complete template is in [`.env.example`](.env.example).

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `ATLAS_IMAGE_REGISTRY` | `docker.io/timo348` | Atlas image prefix; use `ghcr.io/timo348` or an internal mirror |
| `ATLAS_VERSION` | `1.3.0` | Exact release tag used for all three Atlas Docs images |
| `POSTGRES_IMAGE` | pinned Docker Hub digest | PostgreSQL image, overridable for an internal registry |
| `REDIS_IMAGE` | pinned Docker Hub digest | Redis image, overridable for an internal registry |
| `APP_URL` | `http://localhost:30002` | Browser-facing web URL |
| `WEB_PORT` | `30002` | Host port for the web service |
| `COLLAB_PORT` | `30003` | Host port for the collaboration service |
| `COLLAB_PUBLIC_URL` | empty (automatic) | Optional browser-facing WebSocket URL override |
| `AUTH_MODE` | `local` | `local`, `oidc`, or `both` |
| `AUTH_SECRET` | — | Shared secret for authentication and collaboration tokens |
| `ADMIN_NAME` | `Administrator` | Initial administrator display name |
| `ADMIN_EMAIL` | — | Initial administrator email address |
| `ADMIN_PASSWORD` | — | Initial administrator password |
| `DATABASE_URL` | — | Internal PostgreSQL connection URL |
| `REDIS_URL` | `redis://redis:6379` | Internal Redis connection URL |
| `NODE_EXTRA_CA_CERTS` | empty | Optional in-container path to a mounted corporate CA bundle |

`APP_URL` must be a URL that the user's browser can reach. With an empty
`COLLAB_PUBLIC_URL`, Atlas derives `ws://CURRENT_HOST:COLLAB_PORT` (or `wss://`
for HTTPS) from each request, which works with LAN IP addresses and without
internet access. Set an explicit `COLLAB_PUBLIC_URL` when a reverse proxy exposes
the collaboration service on a different hostname, port, or path.

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
The issuer, discovery, JWKS, and token endpoints must be reachable inside the
company network. For a private CA, mount the CA bundle with a small Compose
override and set `NODE_EXTRA_CA_CERTS` to its in-container path.

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

Build the production images locally. This developer path downloads npm packages
and build-time assets and is intentionally separate from the image-only
production deployment:

```bash
docker compose -f compose.yml -f compose.build.yml build
```

## Published images

- [Atlas Docs web](https://hub.docker.com/r/timo348/atlas-docs-web)
- [Atlas Docs collaboration](https://hub.docker.com/r/timo348/atlas-docs-collab)
- [Atlas Docs migrations](https://hub.docker.com/r/timo348/atlas-docs-migrate)
- `ghcr.io/timo348/atlas-docs-web`
- `ghcr.io/timo348/atlas-docs-collab`
- `ghcr.io/timo348/atlas-docs-migrate`

## License

Atlas Docs is licensed under the [Apache License 2.0](LICENSE).
