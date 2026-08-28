import axios, { AxiosInstance } from "axios";

export type NodeRecord = {
  id: string;
  baseUrl: string;
  credential: string;
  headers?: Record<string, string>;
};

const defaultTimeout = Math.max(3000, Number(process.env.NODE_REQUEST_TIMEOUT_MS || 12000));
const clientFor = (node: NodeRecord, timeout = defaultTimeout): AxiosInstance => axios.create({
  baseURL: node.baseUrl.replace(/\/$/, ""),
  timeout,
  headers: {
    Authorization: `Bearer ${node.credential}`,
    "X-ShiroNex-Node": node.id,
    ...(node.headers || {}),
  }
});

export const nodeRequest = async <T=any>(node: NodeRecord, method: string, path: string, data?: any, timeoutMs = defaultTimeout) => {
  const c = clientFor(node, Math.max(3000, timeoutMs));
  try {
    const response = await c.request<T>({ method, url: path, data });
    return response.data;
  } catch (error: any) {
    const payload = error?.response?.data;
    const status = Number(error?.response?.status || error?.statusCode || 502);
    const code = String(error?.code || "");
    const responseMessage = payload?.error || payload?.message;
    const timeout = code === "ECONNABORTED" || code === "ETIMEDOUT";
    const connectionHint = timeout
      ? `Node request timed out after ${Math.round(Number(process.env.NODE_REQUEST_TIMEOUT_MS || 12000) / 1000)}s. Check the FQDN, Cloudflare Tunnel/Zero Trust ingress, daemon port, and firewall.`
      : (!error?.response && code)
        ? `Node request could not reach the configured endpoint (${code}). Check the FQDN, DNS, Cloudflare Tunnel/Zero Trust ingress, daemon port, and firewall.`
        : undefined;
    const rawMessage = String(error?.message || "");
    const normalizedMessage = responseMessage || connectionHint || (rawMessage && rawMessage !== "Node request failed" ? rawMessage : "Node request failed: the configured node endpoint did not respond.");
    const normalized: any = new Error(normalizedMessage);
    normalized.statusCode = status;
    normalized.code = code;
    normalized.dockerUnavailable = payload?.dockerUnavailable === true;
    normalized.nodeUnavailable = !error?.response;
    normalized.timeout = timeout;
    normalized.authFailed = status === 401;
    normalized.responseData = payload;
    throw normalized;
  }
};

const requireHealthResponse = async (node: NodeRecord) => {
  const response: any = await nodeRequest(node, "GET", "/v1/health", undefined, 10000);
  if (!response || typeof response !== "object" || response.ok !== true) {
    const error: any = new Error("Node endpoint returned an unexpected response. Check the FQDN, Cloudflare Access policy, tunnel ingress, and daemon authentication.");
    error.statusCode = 502;
    error.nodeResponseInvalid = true;
    throw error;
  }
  return response;
};

export const nodeControl = {
  health: requireHealthResponse,
  stats: (n:NodeRecord) => nodeRequest(n,"GET","/v1/stats",undefined,10000),
  // Image pulls can legitimately take several minutes on a new node.
  createServer: (n:NodeRecord,d:any) => nodeRequest(n,"POST","/v1/servers",d,Math.max(300000, defaultTimeout)),
  start: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/start`,undefined,30000),
  stop: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/stop`,undefined,30000),
  restart: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/restart`,undefined,30000),
  kill: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/kill`,undefined,30000),
  delete: (n:NodeRecord,id:string) => nodeRequest(n,"DELETE",`/v1/servers/${id}`,undefined,30000),
  status: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/status`,undefined,15000),
  statsServer: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/stats`,undefined,15000),
  logs: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/logs`,undefined,15000),
  command: (n:NodeRecord,id:string,command:string) => nodeRequest(n,"POST",`/v1/servers/${id}/command`,{command},30000),
  files: (n:NodeRecord,id:string,op:string,d:any) => nodeRequest(n,"POST",`/v1/servers/${id}/files/${op}`,d,60000),
  writeBase64: (n:NodeRecord,id:string,path:string,content:string) => nodeRequest(n,"POST",`/v1/servers/${id}/files/write-base64`,{path,content},120000),
  replaceBatch: (n:NodeRecord,id:string,files:Array<{path:string;content:string}>,confirmReplace=false) => nodeRequest(n,"POST",`/v1/servers/${id}/files/replace-batch`,{files,confirmReplace},120000)
};
