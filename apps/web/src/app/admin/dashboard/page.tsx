import { redirect } from "next/navigation";
import { requireUser } from "@/lib/access";
import { AdminDashboard } from "@/components/admin-dashboard";
import { PreferencesProvider } from "@/components/preferences-provider";
import { collectInstanceMetrics, hasPrometheusMetricsToken } from "@/lib/instance-metrics";
import { normalizePreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  const metrics = await collectInstanceMetrics();
  const preferences = normalizePreferences({
    language: user.language,
    colorTheme: user.colorTheme,
    uiFont: user.uiFont,
    editorFont: user.editorFont,
    fontSize: user.fontSize,
    defaultEditorView: user.defaultEditorView,
    fileViewDefaults: user.fileViewDefaults,
    ganttAppearance: user.ganttAppearance,
    defaultSpaceId: user.defaultSpaceId,
    compactMode: user.compactMode,
  });

  return (
    <PreferencesProvider initial={preferences}>
      <AdminDashboard
        metrics={metrics}
        language={preferences.language}
        metricsEnabled={hasPrometheusMetricsToken()}
      />
    </PreferencesProvider>
  );
}
