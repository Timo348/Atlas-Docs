export type MetricsAccessUser = {
  active: boolean;
  role: string;
  metricsAccess?: boolean;
};

/** Check current database values so grants and account locks apply immediately. */
export function canViewInstanceMetrics(user: MetricsAccessUser | null | undefined) {
  return Boolean(user?.active && (
    user.role === "ADMIN"
    || (user.role === "MEMBER" && user.metricsAccess === true)
  ));
}
