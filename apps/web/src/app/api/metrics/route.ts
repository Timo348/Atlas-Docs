import { requireApiUser } from "@/lib/access";
import { configuredPrometheusMetricsToken, collectInstanceMetrics } from "@/lib/instance-metrics";
import { instanceMetricsResponse } from "@/lib/metrics-endpoint";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return instanceMetricsResponse(request, {
    token: configuredPrometheusMetricsToken(),
    currentUser: requireApiUser,
    collect: collectInstanceMetrics,
  });
}
