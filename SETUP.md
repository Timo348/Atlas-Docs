# Atlas Docs setup and operations

This guide covers the supported Docker Compose deployment path on Linux: first
installation, authentication, networking, health checks, upgrades, backups,
restore, and common failures. Run the commands from the repository root unless
a section says otherwise.

Keep three things separate:

- `.env` configures the running installation and contains secrets. It is not
  included in database backups.
- PostgreSQL is the durable application store, including documents, canvases,
  users, permissions, page images, and version records.
- Redis contains collaboration coordination and login-rate-limit state. It is
  not a replacement for a PostgreSQL backup.

Never use `docker compose down -v` during a normal restart or upgrade. The `-v`
option removes the named PostgreSQL and Redis volumes.

## Contents

- [Requirements](#requirements)
- [First installation](#first-installation)
- [Page-specific share links](#page-specific-share-links)
- [Optional OpenID Connect](#optional-openid-connect)
- [Ports, TLS, and reverse proxies](#ports-tls-and-reverse-proxies)
- [Health and routine operations](#health-and-routine-operations)
- [Upgrading](#upgrading)
- [Backup and restore](#backup-and-restore)
- [Portable application export](#portable-application-export)
- [Local images, registries, and disconnected hosts](#local-images-registries-and-disconnected-hosts)
- [Repository checks and package scripts](#repository-checks-and-package-scripts)
- [Troubleshooting](#troubleshooting)

## Requirements

The production path requires:

- a Linux host with Docker Engine and the Docker Compose plugin (`docker
  compose`, not the retired `docker-compose` binary);
- Git for a source checkout, unless a release archive is used instead;
- enough local storage for the containers, PostgreSQL volume, and backups;
- inbound access to the configured web and collaboration endpoints, either
  directly or through a reverse proxy;
- outbound registry access while pulling images, plus access to the identity
  provider when OIDC is enabled.

For the supplied backup script, install Bash, `flock`, `find`, and `sha256sum`.
The scheduled mode also uses GNU `date`. Install `age` only when encrypted
backups are enabled. `openssl` is useful for generating initial secrets, and
`curl` is useful for external health checks.

Confirm the two Docker commands before continuing:

```bash
docker version
docker compose version
```

## First installation

### 1. Obtain one release

Clone the exact published tag you intend to deploy, or unpack the matching
release archive, then enter its root. The value below is the currently published
tag; replace it when deploying a newer release:

```bash
ATLAS_RELEASE=v2.0.1
git clone --branch "$ATLAS_RELEASE" --depth 1 https://github.com/Timo348/Atlas-Docs.git
cd Atlas-Docs
cp .env.example .env
chmod 600 .env
```

Use the `ATLAS_VERSION` shipped with the selected release. Do not combine a
Compose file from `main` or one release with application images from another:
Compose startup commands can change between releases. Do not use an unpinned
`latest` tag for an installation you need to reproduce. To run untagged `main`
source, follow [Build the three application images locally](#build-the-three-application-images-locally)
instead of pulling an older published Atlas image set.

### 2. Create independent secrets

Generate a different value for each purpose. These commands print new random
values; paste each result only into the indicated `.env` field:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 24
```

Use the results as follows:

1. Put the first value in `AUTH_SECRET`. It must be at least 32 characters. The
   Compose stack also uses it as the shared collaboration-service secret.
2. Put the second value in `POSTGRES_PASSWORD` and put the exact same value in
   the password portion of `DATABASE_URL`. Hex output is URL-safe. If a
   different password contains URI-reserved characters, percent-encode them in
   `DATABASE_URL`.
3. Put the third value in `ADMIN_PASSWORD`. The initial seed requires at least
   12 characters.

Do not reuse these values and do not leave any placeholder from `.env.example`
in a reachable installation.

### 3. Complete `.env`

At minimum, review every variable in this table:

| Variable | Purpose and required relationship |
| --- | --- |
| `APP_URL` | Browser-facing origin of Atlas Docs, including `http://` or `https://` and a non-default public port when applicable. Compose passes it to NextAuth as `NEXTAUTH_URL`. |
| `WEB_PORT` | Host port mapped to port `3000` in the web container. The shipped default is `30002`. |
| `COLLAB_PORT` | Host port mapped to port `1234` in the collaboration container. It is also the default browser-facing WebSocket port when `COLLAB_PUBLIC_URL` is empty. The shipped default is `30003`. |
| `COLLAB_PUBLIC_URL` | Optional exact browser-facing `ws://` or `wss://` URL. Set it when a reverse proxy uses a different WebSocket host, port, or URL. Leave it empty only when host derivation plus `COLLAB_PORT` describes the public endpoint correctly. |
| `ATLAS_IMAGE_REGISTRY` | Registry namespace containing the three Atlas images. The release template selects Docker Hub; the commented alternative selects GHCR. |
| `ATLAS_VERSION` | Exact tag used for `atlas-docs-web`, `atlas-docs-collab`, and `atlas-docs-migrate`. |
| `AUTH_MODE` | `local`, `oidc`, or `both`. See [OIDC](#optional-openid-connect). |
| `AUTH_SECRET` | Random value of at least 32 characters. Keep it stable across restarts. |
| `ADMIN_NAME` | Display name used only when the initial administrator is created. |
| `ADMIN_EMAIL` | Email address of the initial administrator. |
| `ADMIN_PASSWORD` | Password used only when that administrator does not already exist; minimum 12 characters. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Credentials used by the PostgreSQL container. |
| `DATABASE_URL` | Internal connection URL. Its user, password, and database must match the PostgreSQL variables, and its host remains `postgres` inside Compose. |
| `REDIS_URL` | Internal Redis URL. The shipped Compose service is reachable as `redis:6379`. |
| `POSTGRES_IMAGE`, `REDIS_IMAGE` | Pinned infrastructure image references. Keep the release values unless deliberately using a tested mirror. |

Changing `ADMIN_PASSWORD` later does not reset an existing administrator's
password: the seed only promotes and reactivates an existing account. Use the
application's administrator controls for an existing user.

Likewise, changing only `POSTGRES_PASSWORD` after PostgreSQL has initialized its
volume does not reinitialize that volume. Keep `POSTGRES_PASSWORD` and
`DATABASE_URL` aligned and plan a database-side credential rotation if the
password must change.

Validate interpolation without printing the resolved configuration (which
would include secrets):

```bash
docker compose config --quiet
```

Do not paste the output of an unrestricted `docker compose config` command into
an issue or chat.

### 4. Pull and start

```bash
docker compose pull
docker compose up -d --no-build
docker compose ps -a
docker compose logs --no-color migrate
```

On first start, Compose waits for PostgreSQL, runs the one-shot `migrate`
service, and starts `web` and `collab` only after migration succeeds. The
migration service performs these operations in order:

1. `prisma migrate deploy`;
2. the idempotent legacy-canvas migration;
3. the initial administrator and `Start` space seed.

An `Exited (0)` `migrate` container is normal. A non-zero exit prevents the
application services from satisfying their startup dependency; inspect its log
before retrying.

With the shipped direct-port defaults, open the host on port `30002`. The same
browser must also be able to connect to port `30003` for live editing. Use the
`ADMIN_EMAIL` and `ADMIN_PASSWORD` configured before the first start.

## Page-specific share links

A space owner or instance administrator can use the link button in a page
header to create access for that page without granting access to its containing
space. Each link has a label, one of two permissions, and an optional expiry:

- `VIEW` opens the current live document or canvas read-only.
- `EDIT` can change the current Markdown, LaTeX, or canvas content. It cannot
  rename the page, upload images, create or restore versions, browse the space,
  manage folders, or change permissions.

These are live links, not frozen publications. Readers see later changes to the
page, and edits made through an `EDIT` link are synchronized to normal Atlas
sessions. Create a normal copy of a page first if a fixed snapshot is required.

The full secret URL is shown only once when it is created. PostgreSQL stores a
SHA-256 hash and a short display prefix, not the reusable token. Consequently,
an owner can change a link between `VIEW` and `EDIT` or revoke it, but cannot
recover its full URL later. Create a replacement if the URL is lost.

Treat every page link as a bearer credential: anyone who receives it can use
the configured permission without signing in. Send links only through a trusted
channel, prefer a short expiry, use `VIEW` unless editing is necessary, and
revoke a link when the collaboration ends. Revocation and permission changes
apply immediately to new connections. An already open collaboration session is
revalidated by the collaboration server within one minute and disconnected when
its link expired, was revoked, or changed permission. The bundled client then
requests the current access state again instead of trusting its old session.

`APP_URL` must contain the public HTTPS origin because Atlas uses it when it
constructs the one-time URL. Public pages send `noindex`, `nofollow`,
`noarchive`, no-cache, and no-referrer directives. Those browser controls do not
erase server access logs: configure the reverse proxy and analytics layer not
to retain or export `/share/<token>` paths if URL secrecy matters. Never place a
share URL in issue reports, screenshots, referrer-bearing links, or public chat.

The page image endpoint also checks the same share token and only serves images
belonging to that exact page. Existing images may be viewed from rendered
Markdown; `EDIT` links intentionally cannot upload new ones. Deleting the page
invalidates all of its links through the database cascade.

Database backups include page-share records, but only in hashed form. Portable
ZIP exports do not include share links or permission records. Restoring a full
database backup can restore links that were active at the backup time, so review
and revoke them after a disaster-recovery restore when that risk is relevant.

## Optional OpenID Connect

Atlas can run with local accounts, OIDC, or both:

- `AUTH_MODE=local` enables only email/password login.
- `AUTH_MODE=oidc` enables only the configured OIDC provider.
- `AUTH_MODE=both` retains local login and also enables OIDC.

For `oidc` or `both`, set all three of `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and
`OIDC_CLIENT_SECRET`. Atlas reads discovery metadata from:

```text
<OIDC_ISSUER>/.well-known/openid-configuration
```

Register this redirect URI at the identity provider:

```text
<APP_URL>/api/auth/callback/authentik
```

The provider registration must permit the `openid`, `email`, and `profile`
scopes and return an email address. The callback identifier is `authentik` even
when another standards-compatible OIDC provider is used. Atlas does not derive
administrator privileges from provider groups; newly created OIDC users enter
as regular members.

After changing authentication variables, validate and recreate the stack:

```bash
docker compose config --quiet
docker compose up -d --no-build
docker compose logs --tail=200 web
```

Before selecting OIDC-only mode, test the provider through `both` mode if
retaining a local recovery login is part of the operating plan.

### Private OIDC certificate authorities

`NODE_EXTRA_CA_CERTS` is a path **inside** the containers. Setting a host path in
`.env` is not enough because `compose.yml` does not mount a CA bundle. For
example, create a local `compose.override.yml` that mounts an administrator-
managed PEM bundle read-only into all three Node.js services:

```yaml
services:
  web:
    volumes:
      - /absolute/host/path/to/ca-bundle.pem:/run/atlas-ca/ca-bundle.pem:ro
  collab:
    volumes:
      - /absolute/host/path/to/ca-bundle.pem:/run/atlas-ca/ca-bundle.pem:ro
  migrate:
    volumes:
      - /absolute/host/path/to/ca-bundle.pem:/run/atlas-ca/ca-bundle.pem:ro
```

Then set:

```dotenv
NODE_EXTRA_CA_CERTS=/run/atlas-ca/ca-bundle.pem
```

Replace the host path, confirm that the non-root container users can read the
file, and run `docker compose config --quiet` before recreating services.

## Ports, TLS, and reverse proxies

The base Compose file publishes only these application ports:

| Host setting | Container endpoint | Use |
| --- | --- | --- |
| `WEB_PORT` | `web:3000` | HTTP application and API |
| `COLLAB_PORT` | `collab:1234` | WebSocket collaboration plus the `/health` endpoint |

PostgreSQL and Redis are not published to the host by `compose.yml`. The two
application port mappings bind according to Docker's default host binding, so
restrict them with the host firewall when they should only be reachable by a
local reverse proxy.

For a public deployment, terminate TLS at a reverse proxy and configure both a
normal HTTPS origin and a WSS collaboration origin. A simple and unambiguous
layout uses two hostnames:

```dotenv
APP_URL=https://<atlas-host>
COLLAB_PUBLIC_URL=wss://<collaboration-host>
```

The following Nginx skeleton shows the required forwarding behavior. Replace
all angle-bracket placeholders and add the site's certificate directives using
the proxy operator's normal TLS tooling:

```nginx
map $http_upgrade $atlas_connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name <atlas-host>;

    location / {
        proxy_pass http://127.0.0.1:<WEB_PORT>;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 443 ssl;
    server_name <collaboration-host>;

    location / {
        proxy_pass http://127.0.0.1:<COLLAB_PORT>;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $atlas_connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
```

If `COLLAB_PUBLIC_URL` is empty, Atlas derives the WebSocket hostname from the
browser request, derives `ws` versus `wss` from the request or forwarded
protocol, and appends `COLLAB_PORT`. Set the explicit URL whenever that result
is not the address a browser can actually reach. `http://` and `https://` are
invalid values for `COLLAB_PUBLIC_URL`; use `ws://` or `wss://`.

The reverse proxy must preserve WebSocket upgrades and must send the original
host and protocol. `APP_URL` must exactly describe the public application
origin, especially for OIDC redirects and secure deployments. Do not expose a
plain `ws://` endpoint from an `https://` page.

## Health and routine operations

Inspect the whole stack, including the completed migration container:

```bash
docker compose ps -a
docker compose logs --tail=200 migrate web collab postgres redis
```

With the shipped host ports, external probes are:

```bash
curl --fail --show-error --silent http://127.0.0.1:30002/api/health
curl --fail --show-error --silent http://127.0.0.1:30003/health
```

Substitute the configured ports, scheme, and hostname when probing through a
proxy. Both endpoints return a JSON `status` of `ok` on success. The web health
route also executes a PostgreSQL query. The collaboration health route proves
that its HTTP/WebSocket process responds; use `docker compose ps` to verify the
separate PostgreSQL and Redis health checks as well.

Useful operating commands are:

```bash
docker compose logs -f web collab
docker compose restart web collab
docker compose images
docker compose stop web collab
docker compose up -d web collab
```

`restart` does not pull new images or run a release upgrade. Use the complete
upgrade procedure below for that.

## Upgrading

Read the target release notes and compare its `.env.example`, `compose.yml`, and
Compose overlays with the installed copies. Preserve `.env` separately, merge
new variables deliberately, and keep a record of the currently deployed
`ATLAS_VERSION`.

### Standard safe upgrade

Install the target release files and merge any new configuration variables, but
leave the installed `.env` on the current `ATLAS_VERSION` for the backup. Record
that version for rollback. You can pre-pull the target application images
without changing `.env`; the shell override applies only to this command:

```bash
ATLAS_VERSION=<target-version> docker compose pull
```

Begin a maintenance window and make sure users have stopped editing. This
matters because the backup flushes open collaboration documents but does not
lock the user interface for the entire dump. While the old containers are still
running, create the history-preserving checkpoint and then stop application
writes:

```bash
./backup.sh upgrade
docker compose stop web collab
```

Confirm that the command reports the completed file under `backups/archive/`
and copy its dump, metadata, and checksum off the application host. Now set
`ATLAS_VERSION=<target-version>` in `.env`, validate the target configuration,
and start it:

```bash
docker compose config --quiet
docker compose up -d --no-build
docker compose ps -a
docker compose logs --no-color migrate
```

Pre-pulling before the maintenance backup reduces downtime. Stopping `web` and
`collab` immediately after that backup prevents later writes while the target
migration service changes the database. `docker compose up` then runs the
target `migrate` service before starting the application containers.

Afterward, check both health endpoints, sign in, open a text document and a
canvas, and review the complete migration log. Keep the upgrade backup until
the release has been validated and according to the installation's retention
policy.

Do not treat a simple image downgrade as a database rollback. If a database
migration must be rolled back, stop application writes and restore the
pre-upgrade database backup together with the corresponding older application
configuration and images.

### Upgrade that separates legacy canvases

The current migration converts drawings that were formerly embedded in a text
page into standalone `CANVAS` pages. For every legacy page with actual canvas
content, it:

- leaves the source text page in place;
- creates a sibling canvas immediately after it, with a title based on the
  source title and a unique `-canvas` slug;
- copies the current drawing into the standalone canvas document;
- copies canvas snapshots from the source page's saved versions into the new
  canvas's version history;
- marks the source page so rerunning the migration is idempotent.

A legacy page without canvas content is marked as checked and does not create
an empty canvas file. If Yjs data cannot be decoded, the source data is kept
unchanged and unmarked, and the migration log prints the affected page ID.

For this release, `./backup.sh upgrade` is mandatory before migration because
the routine `regular` and `archive` tiers omit `PageVersion` table data. The
upgrade tier retains those records and refuses to proceed if live collaboration
documents cannot first be flushed into PostgreSQL.

Review the final `[atlas-migrate] Legacy canvas scan complete` line. A non-zero
`left for recovery` count requires investigation even if the migration
container exited successfully; those decode errors are preserved and reported
without making the whole scan destructive. Do not discard the upgrade backup
or delete the named source data.

Each page is migrated in its own transaction. The default transaction timeout
configured by Compose is 600000 milliseconds. For an unusually large legacy
page, set a larger positive integer before the upgrade, validate Compose, and
rerun the migration with application writes stopped:

```dotenv
ATLAS_CANVAS_MIGRATION_TIMEOUT_MS=<positive-milliseconds>
```

```bash
docker compose stop web collab
docker compose run --rm migrate
docker compose up -d web collab
```

The migration rechecks only unmarked legacy pages, so an ordinary successful
rerun does not create duplicate canvas files.

## Backup and restore

### Server backup tiers

`backup.sh` creates a validated PostgreSQL custom-format dump, a `.metadata`
sidecar, and a `.sha256` sidecar. It uses the Compose PostgreSQL container's own
`pg_dump` and validates the result with `pg_restore --list` before publishing
the files.

| Mode | Directory | Collaboration flush | Table data intentionally omitted | Automatic pruning |
| --- | --- | --- | --- | --- |
| `regular` | `backups/regular/` | Best effort | `PageVersion`, `Session`, `VerificationToken` | Files named `atlas-docs-*` older than `ATLAS_BACKUP_RETENTION_DAYS` (14 by default) |
| `archive` | `backups/archive/` | Best effort | `PageVersion`, `Session`, `VerificationToken` | No |
| `upgrade` | `backups/archive/` | Required | `Session`, `VerificationToken` | No |

All three tiers include document and canvas state stored in PostgreSQL,
accounts, permissions, and page images. A successful collaboration flush first
persists currently open documents; after a best-effort flush failure, a routine
backup contains the latest state that had already reached PostgreSQL. Only
`upgrade` includes the page-version history. Sessions and verification tokens
are intentionally not restored, so users should expect to sign in again after
a restore.

Create backups manually with:

```bash
chmod +x backup.sh
./backup.sh regular
./backup.sh archive
./backup.sh upgrade
```

PostgreSQL must be running. A failed live collaboration flush is a warning for
`regular` and `archive`; an `upgrade` backup stops without creating a dump
because stale collaboration state is not acceptable for a migration
checkpoint.

`./backup.sh scheduled` is intended to be invoked daily. It creates archives on
the 1st and 15th, regular backups on Monday, Wednesday, and Friday, and skips
other days. Preview today's decision without Docker access or a database dump:

```bash
./backup.sh scheduled --dry-run
```

An example daily cron entry is shown below. Replace both paths; do not paste the
placeholders literally:

```cron
0 2 * * * cd <absolute-atlas-directory> && ./backup.sh scheduled >> <absolute-log-file> 2>&1
```

The shell environment, not `.env`, controls these backup options:

- `ATLAS_BACKUP_DIR` changes the backup root;
- `ATLAS_BACKUP_RETENTION_DAYS` sets regular-tier retention to a non-negative
  integer;
- `AGE_RECIPIENT` encrypts the dump with `age` before it is published.

For example, set those variables in the cron or systemd service environment.
The script locks the backup root to prevent concurrent jobs and creates backup
directories with mode `0700` and artifacts with mode `0600`.

Keep at least one tested copy off-host. Securely back up `.env`, reverse-proxy
configuration, private CA material, and any `age` identity separately: the
PostgreSQL dump does not contain them. Never store the decryption identity next
to the only encrypted backup.

### Verify and decrypt an artifact

Run checksum verification from the directory containing the artifact because
the checksum sidecar records its basename:

```bash
cd <directory-containing-backup>
sha256sum --check <backup-file>.sha256
cat <backup-file>.metadata
```

Verify the checksum before decrypting. For an `.age` artifact, decrypt to a
protected temporary location and keep restrictive permissions:

```bash
umask 077
age --decrypt \
  --identity <age-identity-file> \
  --output <temporary-restore-file>.dump \
  <backup-file>.dump.age
```

The file passed to `pg_restore` in the next section must be the decrypted
PostgreSQL custom-format `.dump`, not the `.age` wrapper.

### Restore a PostgreSQL backup

This repository currently has no `restore.sh` wrapper. The restore is therefore
an explicit, reviewable `pg_restore` procedure. It replaces the selected Atlas
database and clears Redis coordination state; do not run it against the wrong
Compose project.

First verify the checksum and metadata, decrypt when necessary, and identify a
release configuration compatible with the backup. If the current database is
still readable, create and move a safety backup off-host before proceeding.
Then set a task-specific shell variable to the absolute dump path:

```bash
ATLAS_RESTORE_DUMP=/absolute/protected/path/atlas-docs-backup.dump
test -s "$ATLAS_RESTORE_DUMP"
```

Stop application writes, make sure the two infrastructure services are up, and
clear the rebuildable Redis state:

```bash
docker compose stop web collab
docker compose up -d postgres redis
docker compose exec -T redis redis-cli FLUSHALL
```

The following command is destructive: it drops and recreates the database named
by `POSTGRES_DB` inside this Compose project. Confirm the project directory and
`.env` one more time, then run:

```bash
docker compose exec -T postgres sh -ec \
  'dropdb --if-exists --force --username="$POSTGRES_USER" "$POSTGRES_DB" && createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" "$POSTGRES_DB"'

docker compose exec -T postgres sh -ec \
  'exec pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' \
  < "$ATLAS_RESTORE_DUMP"
```

Apply the schema and canvas migration from the selected release, seed the
administrator if needed, and restart the application:

```bash
docker compose run --rm migrate
docker compose up -d web collab
docker compose ps -a
docker compose logs --no-color migrate
```

Finally, run both health checks and inspect representative documents, canvases,
permissions, and images. Because session records are excluded, sign in again.
Retain the restored artifact and the pre-restore safety copy until verification
is complete.

For a new host, copy the matching repository/release files, reconstruct and
protect `.env`, transfer the verified dump, start only `postgres` and `redis`,
and follow the same restore sequence. Do not initialize the full web stack and
accept user edits before the database has been restored.

## Portable application export

The profile dialog offers an emergency portable ZIP export. Regular users can
export spaces they can access; administrators can additionally export the
complete instance. Before reading PostgreSQL, the exporter asks the
collaboration service to persist open documents. If that flush fails, the ZIP
continues with the latest state already persisted in PostgreSQL and records a
warning in its README and manifest. The resulting archive contains Markdown or
LaTeX source, standalone `.excalidraw` files, and referenced page images in a
layout suitable for a normal folder, VS Code, or an Obsidian vault.

Page conversion is best effort. If one page cannot be converted, the rest of
the archive is still produced and an adjacent `.export-error.txt` identifies
the affected page. Review the export's README, manifest warnings, and error
files before treating it as a complete snapshot.

This is an escape hatch, not an operational restore backup. It intentionally
omits accounts, permissions, sessions, profile and space images, and document
version history. Use the PostgreSQL backup for disaster recovery or upgrades.

## Local images, registries, and disconnected hosts

### Build the three application images locally

`compose.build.yml` replaces the release image names with local images and uses
the Dockerfile's `web`, `collab`, and `tools` targets:

```bash
docker compose -f compose.yml -f compose.build.yml build
docker compose -f compose.yml -f compose.build.yml up -d
```

The overlay sets `pull_policy: never`, so all required Atlas images must build
successfully on that host. PostgreSQL and Redis still use the references from
`.env`/`compose.yml`.

### Mirror or transfer images

For an internal registry, mirror all three Atlas images and set
`ATLAS_IMAGE_REGISTRY` to their common registry namespace. If PostgreSQL and
Redis must also come from the mirror, set their complete pinned references in
`POSTGRES_IMAGE` and `REDIS_IMAGE`.

For an offline host, resolve and pull every image on a connected Linux machine
using the same tagged release files and `.env` values. Do not prepare an image
bundle from `main` while `ATLAS_VERSION` still selects an older release:

```bash
docker compose pull
docker compose config --images > atlas-images.txt
docker image save --output atlas-images.tar $(cat atlas-images.txt)
sha256sum atlas-images.tar > atlas-images.tar.sha256
```

Transfer the release files, image archive, and checksum through the approved
offline process. Transfer production `.env` separately as a secret. On the
offline host:

```bash
sha256sum --check atlas-images.tar.sha256
docker image load --input atlas-images.tar
docker compose -f compose.yml -f compose.airgap.yml config --quiet
docker compose -f compose.yml -f compose.airgap.yml up -d --no-build
```

`compose.airgap.yml` sets `pull_policy: never` for the application,
PostgreSQL, and Redis services, so a missing image fails locally instead of
causing an external pull attempt.

## Repository checks and package scripts

Production operators should use the migration container rather than installing
Node.js on the server. Contributors can reproduce the repository's scripted
checks with the Node.js generation used by the Dockerfile (Node 22):

```bash
npm ci
npm run db:generate
npm run lint
npm run build
npm test
```

Build before the root test command because the collaboration package's test
script executes compiled files from `apps/collab/dist`.

The database scripts require a reachable `DATABASE_URL` in the caller's
environment:

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` runs Prisma deployment followed by the legacy-canvas migration;
`db:seed` is separate. In Compose, the `migrate` service runs both and then the
seed automatically. The backup scheduler/retention checks are separate from the
root npm test command and require GNU/Linux shell tools:

```bash
bash scripts/backup.test.sh
```

## Troubleshooting

### `migrate` exits non-zero or web never starts

```bash
docker compose ps -a
docker compose logs --no-color migrate postgres
```

Check first for an unreachable/mismatched `DATABASE_URL`, an
`ADMIN_PASSWORD` shorter than 12 characters, a missing `ADMIN_EMAIL`, or a
database migration error. Validate `.env` with `docker compose config --quiet`.
Do not repeatedly delete volumes to make a migration error disappear.

For the legacy canvas scan, also inspect the summary for `left for recovery`.
Those page-level decode failures preserve source data and may not make the
container exit non-zero. Transaction timeout failures do stop the migration;
after securing an upgrade backup, increase
`ATLAS_CANVAS_MIGRATION_TIMEOUT_MS`, keep `web` and `collab` stopped, and rerun
the migration service.

### Web is unhealthy

```bash
docker compose logs --tail=200 web postgres
docker compose exec -T postgres sh -ec 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"'
```

The web health route queries PostgreSQL. Confirm that PostgreSQL is healthy and
that `DATABASE_URL` uses the Compose service hostname `postgres`, not
`localhost`. If credentials were changed after the volume was initialized,
make sure the database role and the URL were changed together.

### Collaboration is offline or continually reconnects

```bash
docker compose ps collab redis
docker compose logs --tail=200 collab redis web
```

Verify that `AUTH_SECRET` is at least 32 characters and unchanged across the
web and collaboration containers, that the browser can reach the resolved
WebSocket URL, and that the reverse proxy forwards `Upgrade` and `Connection`
headers. For HTTPS pages, use WSS. If a proxy changes the public port or host,
set `COLLAB_PUBLIC_URL` explicitly rather than relying on derivation.

### OIDC sign-in fails

Confirm all of the following:

- `AUTH_MODE` is `oidc` or `both`;
- the issuer's discovery URL is reachable from the web container;
- client ID and client secret match the provider registration;
- the exact callback is `<APP_URL>/api/auth/callback/authentik`;
- the provider returns an email claim;
- `APP_URL` and forwarded protocol describe the public HTTPS origin;
- a private CA is both mounted into the container and selected by
  `NODE_EXTRA_CA_CERTS`.

Inspect `docker compose logs --tail=200 web`, but do not publish environment
configuration or tokens while asking for help.

### Local administrator password appears unchanged

Editing `ADMIN_PASSWORD` and restarting does not rotate an existing password.
The seed hashes that value only when it creates the account. Reset the existing
user through the application's administrator interface.

### A port is already allocated

Change `WEB_PORT` or `COLLAB_PORT` in `.env`, update `APP_URL` and/or
`COLLAB_PUBLIC_URL` when the browser-facing address also changes, then run:

```bash
docker compose config --quiet
docker compose up -d --no-build
```

Remember to update firewall and proxy targets.

### Image pull is denied or a tag is missing

```bash
docker compose config --images
docker compose pull
```

Check `ATLAS_IMAGE_REGISTRY`, `ATLAS_VERSION`, registry authentication, and the
pinned PostgreSQL/Redis references. Unlike `config --quiet`, `config --images`
does not print `.env` secrets, but review any diagnostic output before sharing
it.

### Backup fails

Confirm that PostgreSQL and collaboration containers are running and that the
host has Bash, Docker, `flock`, `find`, and `sha256sum`. With encryption, also
confirm that `age` is installed and `AGE_RECIPIENT` is set in the backup job's
shell environment. Check write permission and free space under
`ATLAS_BACKUP_DIR`.

An `upgrade` backup intentionally refuses to continue after a collaboration
flush failure. Repair/start the old collaboration service and retry; do not
substitute a routine backup for a history-preserving Canvas migration
checkpoint.

### Last-resort diagnostics

Collect status and bounded logs without dumping resolved secrets:

```bash
docker compose ps -a
docker compose images
docker compose logs --no-color --tail=300 migrate web collab postgres redis
```

Include the Atlas image tags, the failing health endpoint, and sanitized error
messages when opening an issue. Never attach `.env`, an unrestricted Compose
configuration dump, database dumps, authentication tokens, or private keys.
