import axios, { AxiosInstance } from "axios";

export type NodeRecord = {
  id: string; baseUrl: string; credential: string;
};

const clientFor = (node: NodeRecord): AxiosInstance => axios.create({
  baseURL: node.baseUrl.replace(/\/$/, ""),
  timeout: Number(process.env.NODE_REQUEST_TIMEOUT_MS || 10000),
  headers: { Authorization: `Bearer ${node.credential}`, "X-ShiroNex-Node": node.id }
});

export const nodeRequest = async <T=any>(node: NodeRecord, method: string, path: string, data?: any) => {
  const c = clientFor(node);
  try {
    const response = await c.request<T>({ method, url: path, data });
    return response.data;
  } catch (error: any) {
    const payload = error?.response?.data;
    const normalized: any = new Error(payload?.error || error?.message || "Node request failed");
    normalized.statusCode = Number(error?.response?.status || error?.statusCode || 502);
    normalized.code = error?.code;
    normalized.dockerUnavailable = payload?.dockerUnavailable === true;
    normalized.nodeUnavailable = !error?.response;
    normalized.responseData = payload;
    throw normalized;
  }
};

export const nodeControl = {
  health: (n:NodeRecord) => nodeRequest(n,"GET","/v1/health"),
  stats: (n:NodeRecord) => nodeRequest(n,"GET","/v1/stats"),
  createServer: (n:NodeRecord,d:any) => nodeRequest(n,"POST","/v1/servers",d),
  start: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/start`),
  stop: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/stop`),
  restart: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/restart`),
  kill: (n:NodeRecord,id:string) => nodeRequest(n,"POST",`/v1/servers/${id}/kill`),
  delete: (n:NodeRecord,id:string) => nodeRequest(n,"DELETE",`/v1/servers/${id}`),
  status: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/status`),
  statsServer: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/stats`),
  logs: (n:NodeRecord,id:string) => nodeRequest(n,"GET",`/v1/servers/${id}/logs`),
  command: (n:NodeRecord,id:string,command:string) => nodeRequest(n,"POST",`/v1/servers/${id}/command`,{command}),
  files: (n:NodeRecord,id:string,op:string,d:any) => nodeRequest(n,"POST",`/v1/servers/${id}/files/${op}`,d),
  writeBase64: (n:NodeRecord,id:string,path:string,content:string) => nodeRequest(n,"POST",`/v1/servers/${id}/files/write-base64`,{path,content}),
  replaceBatch: (n:NodeRecord,id:string,files:Array<{path:string;content:string}>,confirmReplace=false) => nodeRequest(n,"POST",`/v1/servers/${id}/files/replace-batch`,{files,confirmReplace})
};
