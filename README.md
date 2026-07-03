# Atlas Docs

Atlas Docs ist eine selbst gehostete Wissensplattform mit Markdown-Seiten, Live-Zusammenarbeit und einem Excalidraw-basierten Canvas.

## Enthalten

- Bereiche mit hierarchisch vorbereiteten Seiten und Markdown-Export
- Live-Markdown, Vorschau, Anwesenheitsanzeige und elementweise synchronisierter Canvas
- Lokale Konten, Authentik über OpenID Connect oder beide Verfahren gleichzeitig
- Benutzerverwaltung mit Rollen, Sperren von Konten und Passwortreset
- PostgreSQL als dauerhafte Datenquelle, Redis für verteilte Live-Synchronisation
- Caddy als Reverse Proxy mit automatischem HTTPS für echte Domains
- Healthchecks, Datenbankmigration und initialer Admin-Seed

## Schnellstart

Voraussetzung ist Docker mit Docker Compose.

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up -d --build
docker compose ps
```

Alternativ können die veröffentlichten Images ohne lokalen Build gestartet werden:

```powershell
docker compose pull
docker compose up -d --no-build
```

Vor dem Start müssen in `.env` mindestens `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD` und das dazu passende Kennwort in `DATABASE_URL` ersetzt werden. `AUTH_SECRET` sollte zufällig erzeugt werden:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Danach ist Atlas standardmäßig unter `http://localhost` erreichbar. Das Startpasswort wird nur bei der erstmaligen Erstellung des Administrators gesetzt; spätere Containerstarts überschreiben es nicht.

## Authentik / OIDC

1. In Authentik eine Anwendung mit einem OAuth2/OpenID-Connect-Provider anlegen.
2. Als Redirect URI `https://docs.example.com/api/auth/callback/authentik` hinterlegen.
3. Die Scopes `openid`, `email` und `profile` freigeben.
4. In `.env` konfigurieren:

```dotenv
APP_URL=https://docs.example.com
SITE_ADDRESS=docs.example.com
AUTH_MODE=both
OIDC_ISSUER=https://auth.example.com/application/o/atlas-docs/
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
```

`both` hält den lokalen Adminzugang als Rückfallebene offen. Wenn OIDC vollständig geprüft ist, kann `AUTH_MODE=oidc` lokale Anmeldungen ausblenden. Der Authentik-Issuer folgt dem Standardpfad `/application/o/<slug>/`; Atlas liest dessen Discovery-Dokument automatisch.

## Produktionsbetrieb

- DNS für `SITE_ADDRESS` auf den Docker-Host zeigen lassen und Ports 80/443 freigeben. Caddy bezieht und erneuert dann das Zertifikat.
- Nur `proxy` veröffentlicht Ports; PostgreSQL, Redis, Web und Collaboration bleiben im internen Compose-Netz.
- Geheimnisse nicht committen. `.env` ist durch `.gitignore` ausgeschlossen.
- Aktualisierung: `docker compose pull && docker compose up -d --build`.
- Status: `docker compose ps` und `docker compose logs -f web collab`.

### Backup

Der vollständige Dokumentzustand liegt in PostgreSQL; Redis ist nur Synchronisations- und Rate-Limit-Infrastruktur.

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

## Entwicklung und Prüfung

Die reproduzierbare Prüfung läuft vollständig in Docker:

```powershell
docker compose build
docker run --rm atlas-docs-web node --version
docker run --rm atlas-docs-collab npm run test --workspace=@atlas/collab
```

Die Architekturentscheidung für Redis plus Datenbank ist absichtlich: Redis verteilt Yjs-Updates zwischen Collaboration-Instanzen; die Hocuspocus-Datenbankerweiterung speichert den binären Yjs-Zustand dauerhaft in PostgreSQL.
