import Link from "next/link";
import {
  ArrowLeft, ChartNoAxesCombined, Database, FileStack, FolderTree, Gauge, Image,
  Link2, RadioTower, Share2, Users,
} from "lucide-react";
import { METRICS_PATH, PAGE_FORMATS, type AtlasPageFormat, type InstanceMetrics } from "@/lib/instance-metrics";

type Language = "de" | "en";

export function AdminDashboard({
  metrics,
  language,
  metricsEnabled,
}: {
  metrics: InstanceMetrics;
  language: Language;
  metricsEnabled: boolean;
}) {
  const text = (english: string, german: string) => language === "de" ? german : english;
  const activeUsers = userCount(metrics, "active");
  const inactiveUsers = userCount(metrics, "inactive");
  const admins = metrics.users.ADMIN.active + metrics.users.ADMIN.inactive;
  const totalPages = Object.values(metrics.pages).reduce((total, count) => total + count, 0);
  const activeShares = shareCount(metrics, "active");
  const inactiveShares = shareCount(metrics, "revoked") + shareCount(metrics, "expired");
  const collectedAt = new Intl.DateTimeFormat(language === "de" ? "de-DE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(metrics.collectedAt);

  return (
    <main className="admin-page admin-dashboard-page">
      <header className="admin-header admin-dashboard-header">
        <div>
          <p className="eyebrow dark"><Gauge size={15} /> {text("Administration", "Administration")}</p>
          <h1>{text("Instance dashboard", "Instanz-Dashboard")}</h1>
          <p>{text("Live overview of the Atlas database. Updated", "Live-Überblick über die Atlas-Datenbank. Aktualisiert")} {collectedAt}.</p>
        </div>
        <div className="admin-header-actions">
          <Link href="/admin/users" className="button compact secondary-button"><Users size={15} /> {text("Users", "Benutzer")}</Link>
          <Link href="/admin/teams" className="button compact secondary-button"><Share2 size={15} /> {text("Teams", "Teams")}</Link>
          <Link href="/" className="button secondary-button"><ArrowLeft size={16} /> {text("Back to workspace", "Zurück zum Workspace")}</Link>
        </div>
      </header>

      <section className="admin-dashboard-cards" aria-label={text("Instance overview", "Instanzübersicht")}>
        <MetricCard
          icon={<Users size={21} />}
          label={text("Active accounts", "Aktive Konten")}
          value={formatNumber(activeUsers, language)}
          detail={text(`${formatNumber(inactiveUsers, language)} inactive · ${formatNumber(admins, language)} administrators`, `${formatNumber(inactiveUsers, language)} inaktiv · ${formatNumber(admins, language)} Administratoren`)}
        />
        <MetricCard
          icon={<FolderTree size={21} />}
          label={text("Spaces", "Bereiche")}
          value={formatNumber(metrics.spaces, language)}
          detail={text(`${formatNumber(metrics.folders, language)} folders`, `${formatNumber(metrics.folders, language)} Ordner`)}
        />
        <MetricCard
          icon={<FileStack size={21} />}
          label={text("Pages", "Seiten")}
          value={formatNumber(totalPages, language)}
          detail={text(`${formatNumber(metrics.pageVersions, language)} saved versions`, `${formatNumber(metrics.pageVersions, language)} gespeicherte Versionen`)}
        />
        <MetricCard
          icon={<Database size={21} />}
          label={text("Content storage", "Inhaltsspeicher")}
          value={formatBytes(metrics.storage.total, language)}
          detail={text(`${formatNumber(metrics.pageImages, language)} page images`, `${formatNumber(metrics.pageImages, language)} Seitenbilder`)}
        />
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-dashboard-panel">
          <header>
            <span className="admin-dashboard-panel-icon"><ChartNoAxesCombined size={20} /></span>
            <div>
              <h2>{text("Content by file type", "Inhalte nach Dateityp")}</h2>
              <p>{text("All page formats are reported with bounded labels for Grafana.", "Alle Seitenformate werden mit begrenzten Labels für Grafana bereitgestellt.")}</p>
            </div>
          </header>
          <div className="admin-format-list">
            {PAGE_FORMATS.map((format) => {
              const count = metrics.pages[format];
              const percent = totalPages ? (count / totalPages) * 100 : 0;
              return (
                <div className="admin-format-row" key={format}>
                  <span>{formatLabel(format, text)}</span>
                  <span className="admin-format-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
                  <strong>{formatNumber(count, language)}</strong>
                </div>
              );
            })}
          </div>
        </article>

        <article className="admin-dashboard-panel">
          <header>
            <span className="admin-dashboard-panel-icon"><Link2 size={20} /></span>
            <div>
              <h2>{text("Sharing & collaboration", "Freigaben & Zusammenarbeit")}</h2>
              <p>{text("Operational counts without exposing people, titles, or access secrets.", "Betriebskennzahlen ohne Personen, Titel oder Zugriffsgeheimnisse offenzulegen.")}</p>
            </div>
          </header>
          <dl className="admin-stat-list">
            <StatLine label={text("Active page links", "Aktive Seitenlinks")} value={formatNumber(activeShares, language)} />
            <StatLine label={text("Inactive page links", "Inaktive Seitenlinks")} value={formatNumber(inactiveShares, language)} />
            <StatLine label={text("Collaboration documents", "Kollaborationsdokumente")} value={formatNumber(metrics.collaborationDocuments, language)} />
            <StatLine label={text("Stored page images", "Gespeicherte Seitenbilder")} value={formatNumber(metrics.pageImages, language)} />
          </dl>
        </article>
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-dashboard-panel">
          <header>
            <span className="admin-dashboard-panel-icon"><Image size={20} /></span>
            <div>
              <h2>{text("Storage composition", "Speicherbelegung")}</h2>
              <p>{text("Only aggregate byte counts are exported.", "Exportiert werden ausschließlich aggregierte Byte-Anzahlen.")}</p>
            </div>
          </header>
          <dl className="admin-stat-list">
            <StatLine label={text("Uploaded files", "Hochgeladene Dateien")} value={formatBytes(metrics.storage.uploadedFiles, language)} />
            <StatLine label={text("Document content", "Dokumentinhalte")} value={formatBytes(metrics.storage.collaborationDocuments, language)} />
            <StatLine label={text("Page images", "Seitenbilder")} value={formatBytes(metrics.storage.pageImages, language)} />
            <StatLine label={text("Profile and space images", "Profil- und Bereichsbilder")} value={formatBytes(metrics.storage.profileImages + metrics.storage.spaceImages, language)} />
          </dl>
        </article>

        <article className="admin-dashboard-panel admin-prometheus-panel">
          <header>
            <span className="admin-dashboard-panel-icon"><RadioTower size={20} /></span>
            <div>
              <div className="admin-panel-title-row">
                <h2>{text("Prometheus & Grafana", "Prometheus & Grafana")}</h2>
                <span className={`status-pill ${metricsEnabled ? "enabled" : "disabled"}`}>{metricsEnabled ? text("Enabled", "Aktiv") : text("Not configured", "Nicht konfiguriert")}</span>
              </div>
              <p>{text("The scrape endpoint is protected independently from Atlas sessions.", "Der Scrape-Endpunkt ist unabhängig von Atlas-Sitzungen geschützt.")}</p>
            </div>
          </header>
          <div className="admin-prometheus-body">
            <p>
              {metricsEnabled
                ? text("Prometheus can scrape the endpoint with the configured bearer token. The token is never shown in Atlas.", "Prometheus kann den Endpunkt mit dem konfigurierten Bearer-Token abrufen. Das Token wird in Atlas niemals angezeigt.")
                : text("Set PROMETHEUS_METRICS_TOKEN to a random value with at least 32 characters and restart the web service. Until then, the endpoint returns 404.", "Setze PROMETHEUS_METRICS_TOKEN auf einen zufälligen Wert mit mindestens 32 Zeichen und starte den Web-Service neu. Bis dahin liefert der Endpunkt 404.")}
            </p>
            <dl className="admin-endpoint-list">
              <StatLine label={text("Metrics path", "Metrics-Pfad")} value={<code>{METRICS_PATH}</code>} />
              <StatLine label={text("Authentication", "Authentifizierung")} value={<code>Authorization: Bearer &lt;token&gt;</code>} />
            </dl>
            <pre className="admin-prometheus-config"><code>{`scrape_configs:
  - job_name: atlas-docs
    metrics_path: ${METRICS_PATH}
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/atlas_metrics_token
    static_configs:
      - targets: ["atlas.example.internal:30002"]`}</code></pre>
          </div>
        </article>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="admin-metric-card">
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

function StatLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function userCount(metrics: InstanceMetrics, state: "active" | "inactive") {
  return metrics.users.ADMIN[state] + metrics.users.MEMBER[state];
}

function shareCount(metrics: InstanceMetrics, state: "active" | "revoked" | "expired") {
  return metrics.shares[state].VIEW + metrics.shares[state].EDIT;
}

function formatNumber(value: number, language: Language) {
  return new Intl.NumberFormat(language === "de" ? "de-DE" : "en-GB").format(value);
}

function formatBytes(value: bigint, language: Language) {
  if (value < 1024n) return `${formatNumber(Number(value), language)} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let divisor = 1024n;
  let unit = 0;
  while (unit < units.length - 1 && value >= divisor * 1024n) {
    divisor *= 1024n;
    unit += 1;
  }
  const tenths = (value * 10n) / divisor;
  const rounded = Number(tenths) / 10;
  return `${new Intl.NumberFormat(language === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 1 }).format(rounded)} ${units[unit]}`;
}

function formatLabel(format: AtlasPageFormat, text: (english: string, german: string) => string) {
  const labels: Record<AtlasPageFormat, string> = {
    MARKDOWN: "Markdown",
    LATEX: "LaTeX",
    CANVAS: "Canvas",
    MERMAID: "Mermaid",
    GANTT: "Gantt",
    TODO: text("Todo", "Aufgaben"),
    TEXT: text("Text", "Text"),
    FILE: text("File", "Datei"),
  };
  return labels[format];
}
