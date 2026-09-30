import {
  hasPrometheusMetricsAuthorization,
  prometheusMetrics,
  type InstanceMetrics,
} from "@/lib/instance-metrics";
import { canViewInstanceMetrics, type MetricsAccessUser } from "@/lib/metrics-access";

type MetricsEndpointDependencies = {
  token: string | null;
  currentUser: () => Promise<MetricsAccessUser | null>;
  collect: () => Promise<InstanceMetrics>;
};

const plainTextHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export async function instanceMetricsResponse(request: Request, dependencies: MetricsEndpointDependencies) {
  try {
    const authorization = request.headers.get("authorization");
    let permitted = hasPrometheusMetricsAuthorization(authorization, dependencies.token);
    if (!permitted) {
      // An explicit bearer attempt must succeed independently of browser cookies.
      if (authorization) return unauthorized();
      const user = await dependencies.currentUser();
      permitted = canViewInstanceMetrics(user);
      if (!permitted) {
        if (user) return new Response("Forbidden\n", { status: 403, headers: plainTextHeaders });
        return dependencies.token
          ? unauthorized()
          : new Response("Not Found\n", { status: 404, headers: plainTextHeaders });
      }
    }

    return new Response(prometheusMetrics(await dependencies.collect()), { headers: plainTextHeaders });
  } catch {
    return new Response("Service Unavailable\n", { status: 503, headers: plainTextHeaders });
  }
}

function unauthorized() {
  return new Response("Unauthorized\n", {
    status: 401,
    headers: { ...plainTextHeaders, "WWW-Authenticate": "Bearer realm=\"atlas-metrics\"" },
  });
}
