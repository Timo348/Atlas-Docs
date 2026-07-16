export type CollaborationUrlOptions = {
  configuredUrl?: string;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProtocol?: string | null;
  requestProtocol?: string;
  publicPort?: string;
};

export function resolveCollaborationUrl(options: CollaborationUrlOptions) {
  const configuredUrl = options.configuredUrl?.trim();
  if (configuredUrl) return validateConfiguredUrl(configuredUrl);

  const host = firstHeaderValue(options.forwardedHost) || firstHeaderValue(options.host);
  if (!host) throw new Error("The request host is unavailable.");

  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    throw new Error("The request host is invalid.");
  }
  if (!hostname) throw new Error("The request host is invalid.");

  const publicPort = options.publicPort?.trim() || "30003";
  if (!/^\d+$/.test(publicPort) || Number(publicPort) < 1 || Number(publicPort) > 65535) {
    throw new Error("PUBLIC_COLLAB_PORT must be a valid TCP port.");
  }

  const forwardedProtocol = firstHeaderValue(options.forwardedProtocol)?.replace(/:$/, "");
  const requestProtocol = options.requestProtocol?.replace(/:$/, "");
  const socketProtocol = (forwardedProtocol || requestProtocol) === "https" ? "wss:" : "ws:";
  const collaborationUrl = new URL(`${socketProtocol}//${hostname}`);
  collaborationUrl.port = publicPort;
  return collaborationUrl.toString().replace(/\/$/, "");
}

function validateConfiguredUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PUBLIC_COLLAB_URL is invalid.");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error("PUBLIC_COLLAB_URL must use ws:// or wss://.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function firstHeaderValue(value?: string | null) {
  return value?.split(",", 1)[0]?.trim();
}
