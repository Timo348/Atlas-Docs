# Atlas Docs

Eine selbst gehostete, kollaborative Wissensplattform mit Markdown-Editor, Live-Vorschau und Excalidraw-basiertem Canvas.

[![Docker Web](https://img.shields.io/docker/v/timo348/atlas-docs-web?label=web&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-web)
[![Docker Collaboration](https://img.shields.io/docker/v/timo348/atlas-docs-collab?label=collaboration&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-collab)
[![Docker Migration](https://img.shields.io/docker/v/timo348/atlas-docs-migrate?label=migration&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-migrate)

## Funktionen

- Live-Markdown mit Vorschau und Markdown-Export
- Gemeinsamer Canvas auf Basis von Excalidraw und Yjs
- Gleichzeitige Bearbeitung mit Präsenzanzeige
- Bereiche, Seiten und rollenbasierte Zugriffsrechte
- Lokale Konten, Authentik/OIDC oder beide Anmeldeverfahren
- Benutzerverwaltung mit Rollen, Kontosperre und Passwortreset
- Persistenz in PostgreSQL, Live-Synchronisierung über Redis
- Automatische Migrationen, initialer Administrator und Healthchecks

## Docker-Images

| Dienst | Docker Hub |
| --- | --- |
| Weboberfläche | [`timo348/atlas-docs-web`](https://hub.docker.com/r/timo348/atlas-docs-web) |
| Live-Collaboration | [`timo348/atlas-docs-collab`](https://hub.docker.com/r/timo348/atlas-docs-collab) |
| Migration und Seed | [`timo348/atlas-docs-migrate`](https://hub.docker.com/r/timo348/atlas-docs-migrate) |

PostgreSQL und Redis verwenden ihre offiziellen Images. Atlas bringt bewusst keinen eigenen Reverse Proxy mit, damit es sich sauber in einen Server mit zentralem Proxy und mehreren Compose-Projekten einfügt.

## Schnellstart

Voraussetzung ist Docker mit Docker Compose.

```powershell
git clone https://github.com/Timo348/Atlas-Docs.git
cd Atlas-Docs
Copy-Item .env.example .env
notepad .env
docker compose pull
docker compose up -d --no-build
```

Die Weboberfläche ist anschließend unter [http://localhost:30002](http://localhost:30002) erreichbar. Der Collaboration-Dienst verwendet Port `30003`.

Vor dem ersten Start müssen in `.env` mindestens folgende Werte ersetzt werden:

```dotenv
AUTH_MODE=local
AUTH_SECRET=ein-zufaelliger-wert-mit-mindestens-32-zeichen
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ein-passwort-mit-mindestens-12-zeichen

POSTGRES_PASSWORD=ein-langes-datenbankpasswort
DATABASE_URL=postgresql://atlas:ein-langes-datenbankpasswort@postgres:5432/atlas
```

Ein zufälliges `AUTH_SECRET` kann unter PowerShell so erzeugt werden:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Das Startpasswort wird nur bei der erstmaligen Erstellung des Administrators gesetzt. Spätere Containerstarts überschreiben es nicht.

## Ports und zentraler Reverse Proxy

| Port | Zweck |
| --- | --- |
| `30002` | Weboberfläche und HTTP-API |
| `30003` | WebSocket-Verbindung für Live-Collaboration |

Für den direkten Betrieb bleiben die Vorgaben aus `.env.example` bestehen:

```dotenv
APP_URL=http://localhost:30002
WEB_PORT=30002
COLLAB_PORT=30003
COLLAB_PUBLIC_URL=ws://localhost:30003
```

Bei einem zentralen HTTPS-Reverse-Proxy müssen beide Ziele weitergeleitet werden. Beispiel:

```dotenv
APP_URL=https://docs.example.com
COLLAB_PUBLIC_URL=wss://collab.docs.example.com
```

Der zentrale Proxy leitet dann `docs.example.com` an Port `30002` und `collab.docs.example.com` mit WebSocket-Unterstützung an Port `30003` weiter.

## Authentik / OIDC

1. In Authentik eine Anwendung mit OAuth2/OpenID-Connect-Provider anlegen.
2. Als Redirect URI `https://docs.example.com/api/auth/callback/authentik` eintragen.
3. Die Scopes `openid`, `email` und `profile` freigeben.
4. Atlas konfigurieren:

```dotenv
AUTH_MODE=both
OIDC_ISSUER=https://auth.example.com/application/o/atlas-docs/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

Mit `AUTH_MODE=both` bleibt der lokale Administrator als Rückfallzugang verfügbar. Nach erfolgreicher OIDC-Prüfung kann `AUTH_MODE=oidc` verwendet werden.

## Betrieb

```powershell
# Status
docker compose ps

# Logs
docker compose logs -f web collab

# Aktualisieren
docker compose pull
docker compose up -d --no-build

# Stoppen
docker compose down
```

### Backup

Der dauerhafte Dokumentzustand liegt in PostgreSQL:

```powershell
New-Item -ItemType Directory -Force backups
docker compose exec postgres pg_dump -U atlas -d atlas -Fc -f /tmp/atlas.dump
docker compose cp postgres:/tmp/atlas.dump .\backups\atlas.dump
```

Wiederherstellung in eine leere Atlas-Datenbank:

```powershell
docker compose cp .\backups\atlas.dump postgres:/tmp/atlas.dump
docker compose exec postgres pg_restore -U atlas -d atlas --clean --if-exists /tmp/atlas.dump
```

## Lokaler Build und Tests

```powershell
docker compose build
docker build --target build-web -t atlas-docs-build-web .
docker run --rm atlas-docs-build-web npm run test --workspace=@atlas/web
docker run --rm atlas-docs-collab npm run test --workspace=@atlas/collab
```
