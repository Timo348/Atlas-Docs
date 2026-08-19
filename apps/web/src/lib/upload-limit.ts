const DEFAULT_UPLOAD_LIMIT_MB = 25;
const MAX_CONFIGURED_UPLOAD_LIMIT_MB = 1024;

export function uploadLimitMb(configured = process.env.ATLAS_UPLOAD_MAX_MB) {
  if (!configured) return DEFAULT_UPLOAD_LIMIT_MB;
  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= MAX_CONFIGURED_UPLOAD_LIMIT_MB
    ? parsed
    : DEFAULT_UPLOAD_LIMIT_MB;
}

export function uploadLimitBytes(configured = process.env.ATLAS_UPLOAD_MAX_MB) {
  return uploadLimitMb(configured) * 1024 * 1024;
}
