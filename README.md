# Atlas Docs

Eine selbst gehostete Wissensplattform für gemeinsame Dokumentation mit Markdown, LaTeX, Live-Collaboration und Excalidraw.

## Quick Start mit Docker Compose

Voraussetzung ist eine aktuelle Docker-Installation mit Docker Compose.

```powershell
git clone https://github.com/Timo348/Atlas-Docs.git
cd Atlas-Docs
Copy-Item .env.example .env
notepad .env
docker compose pull
docker compose up -d --no-build
```

Vor dem ersten Start müssen in `.env` mindestens die folgenden Beispielwerte ersetzt werden:

```dotenv
AUTH_SECRET=ein-zufaelliger-wert-mit-mindestens-32-zeichen
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ein-passwort-mit-mindestens-12-zeichen
POSTGRES_PASSWORD=ein-langes-datenbankpasswort
DATABASE_URL=postgresql://atlas:ein-langes-datenbankpasswort@postgres:5432/atlas
```

Danach ist Atlas Docs unter [http://localhost:30002](http://localhost:30002) erreichbar. Der einmalige `migrate`-Dienst spielt zuvor alle Datenbankmigrationen ein und legt den initialen Administrator an.

```powershell
# Status und Healthchecks anzeigen
docker compose ps

# Web- und Collaboration-Logs verfolgen
docker compose logs -f web collab
```

[![Docker Web](https://img.shields.io/docker/v/timo348/atlas-docs-web?label=web&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-web)
[![Docker Collaboration](https://img.shields.io/docker/v/timo348/atlas-docs-collab?label=collaboration&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-collab)
[![Docker Migration](https://img.shields.io/docker/v/timo348/atlas-docs-migrate?label=migration&sort=semver)](https://hub.docker.com/r/timo348/atlas-docs-migrate)

## Funktionen

### Dokumente und Zusammenarbeit

- Markdown-Seiten mit Live-Vorschau und `.md`-Export
- LaTeX-Seiten mit gerenderter Vorschau und `.tex`-Export
- Gleichzeitiges Schreiben über Yjs und Hocuspocus
- Live-Cursor mit Name, Farbe und Profilbild der schreibenden Person
- Gemeinsamer Excalidraw-Canvas

### Struktur und Zugriffssteuerung

- Durchsuchbarer Bereichswechsler
- Verschachtelte Ordner und darin einsortierte Seiten
- Individuelle Bereichsbilder
- Direkte Freigaben an Benutzer und Freigaben an Teams
- Rollen `OWNER`, `EDITOR` und `VIEWER`
- Dauerhafte oder zeitlich begrenzte Teammitgliedschaften

### Benutzer und Anmeldung

- Lokale Konten, Authentik/generisches OIDC oder beide Verfahren parallel
- Benutzerverwaltung mit Administrator- und Mitgliedsrolle
- Kontosperre und lokaler Passwortreset
- Persönliche Profilbilder im JPG- oder PNG-Format

## Architektur

| Dienst | Aufgabe | Image |
| --- | --- | --- |
| `web` | Next.js-Oberfläche, API, Anmeldung und Editor | `timo348/atlas-docs-web` |
| `collab` | Hocuspocus/Yjs-WebSocket-Dienst | `timo348/atlas-docs-collab` |
| `migrate` | Prisma-Migrationen und initialer Administrator | `timo348/atlas-docs-migrate` |
| `postgres` | Dauerhafte Anwendungs- und Dokumentdaten | `postgres:17-alpine` |
| `redis` | Live-Synchronisierung zwischen Collaboration-Instanzen | `redis:7.4-alpine` |

PostgreSQL und Redis verwenden offizielle Images. Atlas Docs bringt bewusst keinen Reverse Proxy mit und veröffentlicht Web und Collaboration direkt auf getrennten Ports.

## Konfiguration

Die vollständige Vorlage liegt in [`.env.example`](.env.example).

| Variable | Standard/Beispiel | Bedeutung |
| --- | --- | --- |
| `ATLAS_VERSION` | `1.1.0` | Tag der drei Atlas-Docker-Images |
| `APP_URL` | `http://localhost:30002` | Öffentliche URL der Weboberfläche |
| `WEB_PORT` | `30002` | Host-Port der Weboberfläche |
| `COLLAB_PORT` | `30003` | Host-Port des Collaboration-Dienstes |
| `COLLAB_PUBLIC_URL` | `ws://localhost:30003` | Vom Browser erreichbare WebSocket-URL |
| `AUTH_MODE` | `local` | `local`, `oidc` oder `both` |
| `AUTH_SECRET` | – | Gemeinsames Geheimnis für Anmeldung und Collaboration |
| `ADMIN_NAME` | `Administrator` | Anzeigename des initialen Administrators |
| `ADMIN_EMAIL` | – | E-Mail des initialen Administrators |
| `ADMIN_PASSWORD` | – | Startpasswort des initialen Administrators |
| `DATABASE_URL` | – | Interne PostgreSQL-Verbindung |
| `REDIS_URL` | `redis://redis:6379` | Interne Redis-Verbindung |

Das Startpasswort wird nur beim erstmaligen Anlegen des Administrators verwendet. Ein `AUTH_SECRET` lässt sich unter PowerShell so erzeugen:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

## Rechtekonzept

| Rolle | Lesen | Seiten bearbeiten | Bereich und Rechte verwalten |
| --- | :---: | :---: | :---: |
| `VIEWER` | Ja | Nein | Nein |
| `EDITOR` | Ja | Ja | Nein |
| `OWNER` | Ja | Ja | Ja |

Ein Benutzer kann seine wirksame Rolle direkt oder über ein Team erhalten. Abgelaufene Teamzuweisungen gewähren keinen Zugriff mehr. Globale Administratoren können Bereiche, Teams und Benutzer zentral verwalten.

## Authentik / OpenID Connect

1. In Authentik eine Anwendung mit OAuth2/OpenID-Connect-Provider anlegen.
2. Als Redirect URI `https://docs.example.com/api/auth/callback/authentik` eintragen.
3. Die Scopes `openid`, `email` und `profile` freigeben.
4. Atlas Docs konfigurieren:

```dotenv
AUTH_MODE=both
OIDC_ISSUER=https://auth.example.com/application/o/atlas-docs/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

Mit `AUTH_MODE=both` bleibt die lokale Anmeldung verfügbar. Bei `AUTH_MODE=oidc` wird ausschließlich OIDC angeboten.

## Reverse Proxy und HTTPS

Für den direkten Betrieb gelten:

```dotenv
APP_URL=http://localhost:30002
COLLAB_PUBLIC_URL=ws://localhost:30003
```

Hinter einem zentralen HTTPS-Reverse-Proxy werden zwei öffentliche Ziele benötigt:

```dotenv
APP_URL=https://docs.example.com
COLLAB_PUBLIC_URL=wss://collab.docs.example.com
```

Der Proxy leitet `docs.example.com` an Port `30002` und `collab.docs.example.com` mit WebSocket-Unterstützung an Port `30003` weiter.

## Aktualisieren und Betrieb

```powershell
# Neue Images laden und Dienste neu erstellen
docker compose pull
docker compose up -d --no-build

# Status prüfen
docker compose ps

# Logs ansehen
docker compose logs -f web collab migrate

# Dienste stoppen, Daten-Volumes aber behalten
docker compose down
```

Durch `ATLAS_VERSION` in `.env` bleibt eine Installation auf einem festen Release. Für ein Update wird dieser Wert auf den gewünschten Tag geändert.

## Backup und Wiederherstellung

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

Vor einem Restore sollte der aktuelle Datenbestand zusätzlich gesichert werden.

## Entwicklung und Tests

Für einen lokalen Node.js-Workflow werden Node.js 22 und eine erreichbare PostgreSQL-/Redis-Umgebung benötigt.

```powershell
npm ci
npm run db:generate
npm run lint
npm test
npm run build
```

Die produktionsnahen Images können auch lokal gebaut werden:

```powershell
docker compose build
```

## Docker-Images

- [Weboberfläche auf Docker Hub](https://hub.docker.com/r/timo348/atlas-docs-web)
- [Collaboration-Dienst auf Docker Hub](https://hub.docker.com/r/timo348/atlas-docs-collab)
- [Migration und Seed auf Docker Hub](https://hub.docker.com/r/timo348/atlas-docs-migrate)
