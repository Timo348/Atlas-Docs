import { configuredPrometheusMetricsToken, collectInstanceMetrics, hasPrometheusMetricsAuthorization, prometheusMetrics } from "@/lib/instance-metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const plainTextHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const token = configuredPrometheusMetricsToken();
  if (!token) return new Response("Not Found\n", { status: 404, headers: plainTextHeaders });
  if (!hasPrometheusMetricsAuthorization(request.headers.get("authorization"), token)) {
    return new Response("Unauthorized\n", {
      status: 401,
      headers: { ...plainTextHeaders, "WWW-Authenticate": "Bearer realm=\"atlas-metrics\"" },
    });
  }

  try {
    return new Response(prometheusMetrics(await collectInstanceMetrics()), { headers: plainTextHeaders });
  } catch {
    return new Response("Service Unavailable\n", { status: 503, headers: plainTextHeaders });
  }
}
