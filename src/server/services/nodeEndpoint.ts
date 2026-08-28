import { decryptSecret } from "./security.js";

export type NodeEndpoint = {
  id: string;
  baseUrl: string;
  credential: string;
  headers?: Record<string, string>;
};

const hasScheme = (value: string) => /^[a-z][a-z\d+.-]*:\/\//i.test(value);

/**
 * Build the panel-to-daemon URL from one canonical node record.
 *
 * A direct node uses apiPort. A reverse-proxied/FQDN node uses the public
 * endpoint's normal HTTPS/HTTP port unless an explicit port was supplied in
 * the FQDN field. This is required for Cloudflare Tunnel and similar ingress
 * setups where the daemon listens on 6768 privately but is exposed as HTTPS
 * on the public hostname.
 */
export const nodeBaseUrl = (node: any) => {
  const configured = String(node?.fqdn || node?.hostname || node?.publicIp || "").trim();
  if (!configured) throw new Error("Node has no hostname or FQDN configured");

  const protocol = node?.behindProxy ? "https" : (node?.tls === false ? "http" : "https");
  const parsed = new URL(hasScheme(configured) ? configured : `${protocol}://${configured}`);
  if (!parsed.port) {
    // `apiPort` is the current schema. Keep `daemonPort` and legacy `port`
    // fallbacks so nodes created by older panel versions remain reachable.
    const configuredApiPort = Number(node?.apiPort ?? node?.daemonPort ?? node?.port);
    const directPort = Number.isInteger(configuredApiPort) && configuredApiPort > 0 && configuredApiPort <= 65535
      ? configuredApiPort
      : 6768;
    const defaultPort = node?.behindProxy ? (parsed.protocol === "https:" ? 443 : 80) : directPort;
    parsed.port = String(defaultPort);
  }
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
};

export const nodeConnection = (node: any): NodeEndpoint => {
  if (!node?.id) throw new Error("Node record is missing an id");
  if (!node.credential && !node.credentialHash) throw new Error("Node has not been registered yet");

  const headers: Record<string, string> = {};
  if (node.cloudflareAccessClientId && node.cloudflareAccessClientSecret) {
    headers["CF-Access-Client-Id"] = String(node.cloudflareAccessClientId);
    headers["CF-Access-Client-Secret"] = decryptSecret(String(node.cloudflareAccessClientSecret));
  }

  let credential: string;
  try {
    credential = decryptSecret(String(node.credential || ""));
  } catch {
    const error: any = new Error("Node credential is invalid or unreadable. Rotate the node credential and reinstall the generated daemon configuration.");
    error.statusCode = 502;
    error.authFailed = true;
    throw error;
  }

  return {
    id: String(node.id),
    baseUrl: nodeBaseUrl(node),
    credential,
    headers: Object.keys(headers).length ? headers : undefined,
  };
};

export const nodeUrlParts = (baseUrl: string) => {
  const url = new URL(baseUrl);
  return {
    url,
    hostname: url.hostname,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  };
};
