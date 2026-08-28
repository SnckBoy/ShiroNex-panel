import React, { useEffect, useState } from "react";
import axios from "axios";
import { Activity, CheckCircle2, ClipboardList, Cpu, HardDrive, Pencil, Plus, Power, RefreshCw, RotateCw, Server, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const staffRoles = ["admin", "owner"];

const statusClass = (status: string) => {
  if (status === "ONLINE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "MAINTENANCE") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  if (status === "INSTALLING") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (status === "ERROR") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  if (status === "DISABLED") return "border-slate-400/25 bg-slate-400/10 text-slate-300";
  if (status === "SETUP_REQUIRED") return "border-violet-400/25 bg-violet-400/10 text-violet-200";
  return "border-rose-400/25 bg-rose-400/10 text-rose-300";
};

const ageLabel = (node: any) => {
  if (!node.lastHeartbeat) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(node.lastHeartbeat)) / 1000));
  return seconds < 2 ? "Just now" : `${seconds}s ago`;
};

const requestErrorMessage = (requestError: any, fallback: string) => {
  const data = requestError?.response?.data;
  const message = String(data?.error || requestError?.message || fallback);
  const hint = data?.hint ? ` ${String(data.hint)}` : "";
  return `${message}${hint}`;
};

const endpointLabel = (node: any) => {
  const host = node.fqdn || node.hostname || node.publicIp || "address pending";
  const port = node.behindProxy ? 443 : node.apiPort;
  return `${host}:${port}`;
};

export default function Nodes() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<any>(null);
  const [created, setCreated] = useState<any>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", hostname: "", fqdn: "", publicIp: "", apiPort: "6768", sftpPort: "2022", location: "", visibility: "public" as "public" | "private", tls: false, behindProxy: false, memory: "", memoryOverallocate: "0", disk: "", diskOverallocate: "0", cpu: "", serverDirectory: "/var/lib/shironex/servers", cloudflareZoneId: "", createCloudflareDns: false, cloudflareAccessClientId: "", cloudflareAccessClientSecret: "" });

  const formFromNode = (node: any) => ({
    name: String(node.name || ""), description: String(node.description || ""), hostname: String(node.hostname || node.fqdn || node.publicIp || ""), fqdn: String(node.fqdn || node.hostname || ""), publicIp: String(node.publicIp || ""), apiPort: String(node.apiPort || "6768"), sftpPort: String(node.sftpPort || "2022"), location: String(node.location || ""), visibility: node.visibility === "private" ? "private" as const : "public" as const, tls: node.tls !== false, behindProxy: Boolean(node.behindProxy), memory: String(node.memory || ""), memoryOverallocate: String(node.memoryOverallocate ?? "0"), disk: String(node.disk || ""), diskOverallocate: String(node.diskOverallocate ?? "0"), cpu: String(node.cpu || ""), serverDirectory: String(node.serverDirectory || "/var/lib/shironex/servers"), cloudflareZoneId: String(node.cloudflareZoneId || ""), createCloudflareDns: false, cloudflareAccessClientId: String(node.cloudflareAccessClientId || ""), cloudflareAccessClientSecret: ""
  });

  const load = async () => {
    try {
      setNodes((await axios.get("/api/nodes")).data);
      setError("");
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, "Unable to load nodes."));
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  if (!staffRoles.includes(user?.role || "")) return <div className="p-10 text-center">You do not have permission to manage nodes.</div>;

  const openCreate = () => {
    setEditingNode(null);
    setForm({ name: "", description: "", hostname: "", fqdn: "", publicIp: "", apiPort: "6768", sftpPort: "2022", location: "", visibility: "public", tls: false, behindProxy: false, memory: "", memoryOverallocate: "0", disk: "", diskOverallocate: "0", cpu: "", serverDirectory: "/var/lib/shironex/servers", cloudflareZoneId: "", createCloudflareDns: false, cloudflareAccessClientId: "", cloudflareAccessClientSecret: "" });
    setOpen(true);
  };

  const openEdit = (node: any) => {
    setEditingNode(node);
    setForm(formFromNode(node));
    setOpen(true);
  };

  const saveNode = async () => {
    setBusy(editingNode ? `${editingNode.id}:edit` : "create");
    setError("");
    try {
      const payload: any = { ...form, apiPort: Number(form.apiPort), sftpPort: Number(form.sftpPort), memory: Number(form.memory) || 0, memoryOverallocate: Number(form.memoryOverallocate) || 0, disk: Number(form.disk) || 0, diskOverallocate: Number(form.diskOverallocate) || 0, cpu: Number(form.cpu) || 0 };
      if (editingNode && !form.cloudflareAccessClientSecret) delete payload.cloudflareAccessClientSecret;
      const response = editingNode ? await axios.patch(`/api/nodes/${editingNode.id}`, payload) : await axios.post("/api/nodes", payload);
      if (!editingNode) setCreated(response.data);
      setOpen(false);
      setEditingNode(null);
      await load();
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, editingNode ? "Node update failed." : "Node creation failed."));
    } finally {
      setBusy(null);
    }
  };

  const action = async (id: string, actionName: string, method: "post" | "delete" = "post") => {
    setBusy(`${id}:${actionName}`);
    setError("");
    try {
      const url = actionName ? `/api/nodes/${id}/${actionName}` : `/api/nodes/${id}`;
      await axios({ method, url });
      await load();
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, `Node action failed: ${actionName}`));
    } finally {
      setBusy(null);
    }
  };

  const testHealth = async (id: string) => {
    setBusy(`${id}:health`);
    try {
      const response = await axios.get(`/api/nodes/${id}/health`);
      setHealth((current) => ({ ...current, [id]: response.data }));
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, "Node health check failed."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this node? Nodes with assigned servers cannot be deleted.")) return;
    await action(id, "", "delete");
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="snx-eyebrow"><Activity className="h-3.5 w-3.5" /> Infrastructure control</p>
          <h1 className="snx-page-title">ShiroNex Nodes</h1>
          <p className="snx-page-subtitle">Authenticated daemons, real heartbeat age, Docker health, and maintenance controls.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="snx-icon-button" aria-label="Refresh nodes"><RefreshCw className="h-4 w-4" /></button>
          <button type="button" onClick={openCreate} className="snx-primary-button"><Plus className="h-4 w-4" /> Create Node</button>
        </div>
      </header>

      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
      {created && <div className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-5"><div className="flex items-center gap-2 font-semibold text-emerald-200"><ShieldCheck className="h-4 w-4" /> Node created — one-time setup command</div><p className="mt-2 text-xs text-muted-foreground">The token expires in 15 minutes and is not stored in plaintext. Run this command as root on the target VPS.</p><pre className="mt-3 overflow-auto rounded-xl bg-black/60 p-4 text-xs text-emerald-300">curl -fsSL {location.origin}/node.sh | sudo bash -s -- --panel {location.origin} --node-id {created.id} --setup-token {created.setupToken} --port {created.apiPort}</pre><button type="button" onClick={() => setCreated(null)} className="mt-3 text-sm text-emerald-200 underline">Close</button></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {nodes.map((node) => {
          const stats = node.lastStats || {};
          const nodeHealth = health[node.id];
          const isMaintenance = Boolean(node.maintenance);
          return (
            <article key={node.id} className="snx-console-surface rounded-2xl p-5 transition hover:-translate-y-0.5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3">
                  <div className="snx-brand-mark h-11 w-11"><Server className="h-5 w-5" /></div>
                  <div className="min-w-0"><h2 className="truncate font-semibold text-foreground">{node.name}</h2><p className="truncate font-mono text-xs text-muted-foreground">{endpointLabel(node)}</p><p className="mt-1 text-[11px] text-muted-foreground">{node.os || "Linux daemon"} · {node.architecture || "architecture pending"}{node.behindProxy ? " · proxied ingress" : ""}</p></div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] ${statusClass(node.status)}`}>{node.status || "OFFLINE"}</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-black/15 p-3"><Cpu className="mb-2 h-3.5 w-3.5 text-cyan-300" /><div className="text-[10px] uppercase tracking-wider text-muted-foreground">CPU</div><b className="text-sm">{typeof stats.cpuUsage === "number" ? `${stats.cpuUsage.toFixed(1)}%` : "—"}</b></div>
                <div className="rounded-xl border border-white/10 bg-black/15 p-3"><Activity className="mb-2 h-3.5 w-3.5 text-violet-300" /><div className="text-[10px] uppercase tracking-wider text-muted-foreground">RAM</div><b className="text-sm">{stats.memory ? `${Math.round(stats.memory.used / 1024 / 1024)} MB` : "—"}</b></div>
                <div className="rounded-xl border border-white/10 bg-black/15 p-3"><HardDrive className="mb-2 h-3.5 w-3.5 text-amber-300" /><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Disk</div><b className="text-sm">{stats.disk ? `${Math.round(stats.disk.used / 1024 / 1024 / 1024)} GB` : "—"}</b></div>
                <div className="rounded-xl border border-white/10 bg-black/15 p-3"><CheckCircle2 className="mb-2 h-3.5 w-3.5 text-emerald-300" /><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Docker</div><b className="text-sm">{typeof stats.docker === "boolean" ? (stats.docker ? "Ready" : "Down") : "—"}</b></div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Last heartbeat: <b className={node.status === "ONLINE" ? "text-emerald-300" : "text-amber-200"}>{ageLabel(node)}</b></span><span>Servers: {stats.servers?.running ?? "—"}/{stats.servers?.total ?? "—"} running</span><span>Daemon: {node.daemonVersion || stats.daemonVersion || "pending"}</span></div>
              {nodeHealth && <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3 text-xs text-muted-foreground">Health: <b className={nodeHealth.node?.status === "ok" ? "text-emerald-300" : "text-rose-300"}>{nodeHealth.node?.status || "unknown"}</b>{nodeHealth.node?.latencyMs != null && ` · ${nodeHealth.node.latencyMs}ms`}{nodeHealth.docker != null && ` · Docker ${nodeHealth.docker ? "ready" : "unavailable"}`}</div>}

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => openEdit(node)} className="snx-secondary-button"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" disabled={busy !== null} onClick={() => void testHealth(node.id)} className="snx-secondary-button"><Wrench className="h-3.5 w-3.5" /> Test health</button>
                <button type="button" disabled={busy !== null} onClick={() => void action(node.id, "reconnect")} className="snx-secondary-button"><RefreshCw className="h-3.5 w-3.5" /> Reconnect</button>
                <a href={`/allocations?nodeId=${encodeURIComponent(node.id)}`} className="snx-secondary-button"><ClipboardList className="h-3.5 w-3.5" /> Allocations</a>
                <button type="button" disabled={busy !== null} onClick={() => void action(node.id, isMaintenance ? "maintenance" : "maintenance", isMaintenance ? "delete" : "post")} className="snx-secondary-button"><Power className="h-3.5 w-3.5" /> {isMaintenance ? "Exit maintenance" : "Maintenance"}</button>
                <button type="button" disabled={busy !== null} onClick={() => void action(node.id, node.disabled ? "enable" : "disable")} className="snx-secondary-button"><Power className="h-3.5 w-3.5" /> {node.disabled ? "Enable" : "Disable"}</button>
                <button type="button" disabled={busy !== null} onClick={() => void action(node.id, "rotate")} className="snx-secondary-button"><RotateCw className="h-3.5 w-3.5" /> Rotate credential</button>
                <button type="button" disabled={busy !== null} onClick={() => void remove(node.id)} className="snx-secondary-button text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </article>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="mx-auto my-6 grid max-w-5xl gap-4 rounded-3xl border border-cyan-300/20 bg-slate-900/95 p-4 shadow-2xl shadow-cyan-950/30 md:p-6 lg:grid-cols-[1fr_1.08fr]">
            <section className="rounded-2xl border border-white/10 bg-black/15 p-4 md:p-5">
              <p className="snx-eyebrow"><Server className="h-3.5 w-3.5" /> Basic details</p>
              <h2 className="mt-2 text-2xl font-semibold">{editingNode ? "Edit node settings" : "Create a new node"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{editingNode ? "Update the endpoint, proxy mode, resources, and runtime paths. The existing node credential is preserved." : "Create the panel record first. ShiroNex will then generate a one-time token and installation command for the target VPS."}</p>
              <div className="mt-5 space-y-3">
                <label className="block text-xs font-medium text-muted-foreground">Node name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Production Node 01" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>
                <label className="block text-xs font-medium text-muted-foreground">Description<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Primary Minecraft workloads" rows={3} className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>
                <label className="block text-xs font-medium text-muted-foreground">Location<input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} placeholder="Frankfurt, DE" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>
                <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-medium text-muted-foreground">Hostname<input value={form.hostname} onChange={(event) => setForm((current) => ({ ...current, hostname: event.target.value }))} placeholder="node.example.com" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label><label className="block text-xs font-medium text-muted-foreground">FQDN<input value={form.fqdn} onChange={(event) => setForm((current) => ({ ...current, fqdn: event.target.value }))} placeholder="node.example.com" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label></div>
                <label className="block text-xs font-medium text-muted-foreground">Public IP<input value={form.publicIp} onChange={(event) => setForm((current) => ({ ...current, publicIp: event.target.value }))} placeholder="203.0.113.10" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-medium text-muted-foreground">Node visibility</p><div className="mt-2 flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={form.visibility === "public"} onChange={() => setForm((current) => ({ ...current, visibility: "public" }))} /> Public</label><label className="flex items-center gap-2"><input type="radio" checked={form.visibility === "private"} onChange={() => setForm((current) => ({ ...current, visibility: "private" }))} /> Private</label></div><p className="mt-2 text-[11px] text-muted-foreground">Private nodes are excluded from automatic deployment.</p></div>
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-black/15 p-4 md:p-5">
              <p className="snx-eyebrow"><Wrench className="h-3.5 w-3.5" /> Configuration</p>
              <h3 className="mt-2 text-lg font-semibold">Daemon resources</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {([['memory','Total memory (MB)','8192'],['memoryOverallocate','Memory over-allocation (%)','0'],['disk','Total disk (GB)','100'],['diskOverallocate','Disk over-allocation (%)','0'],['cpu','CPU limit (%)','100'],['apiPort','Daemon port','6768'],['sftpPort','Daemon SFTP port','2022']] as const).map(([key, label, placeholder]) => <label key={key} className="block text-xs font-medium text-muted-foreground">{label}<input value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} inputMode="numeric" min={key.includes('Overallocate') ? -1 : 1} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>)}
              </div>
              <label className="mt-3 block text-xs font-medium text-muted-foreground">Server file directory<input value={form.serverDirectory || "/var/lib/shironex/servers"} onChange={(event) => setForm((current) => ({ ...current, serverDirectory: event.target.value }))} placeholder="/var/lib/shironex/servers" className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-sm text-foreground outline-none focus:border-cyan-300/50" /></label>
              <div className="mt-5 space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.tls} onChange={(event) => setForm((current) => ({ ...current, tls: event.target.checked }))} /> Use HTTPS/TLS for daemon communication</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.behindProxy} onChange={(event) => setForm((current) => ({ ...current, behindProxy: event.target.checked, tls: event.target.checked ? true : current.tls }))} /> Behind a reverse proxy</label>{!editingNode && <label className="flex items-center gap-2"><input type="checkbox" checked={form.createCloudflareDns} onChange={(event) => setForm((current) => ({ ...current, createCloudflareDns: event.target.checked }))} /> Create Cloudflare DNS automatically</label>}{form.behindProxy && <div className="space-y-2 rounded-xl border border-violet-300/15 bg-violet-300/5 p-3"><p className="text-xs font-medium text-violet-200">Optional Cloudflare Access service token</p><input value={form.cloudflareAccessClientId} onChange={(event) => setForm((current) => ({ ...current, cloudflareAccessClientId: event.target.value }))} placeholder="Client ID" className="w-full rounded-xl border border-white/10 bg-black/20 p-2.5 text-sm text-foreground outline-none focus:border-cyan-300/50" /><input type="password" autoComplete="new-password" value={form.cloudflareAccessClientSecret} onChange={(event) => setForm((current) => ({ ...current, cloudflareAccessClientSecret: event.target.value }))} placeholder="Client secret (stored encrypted)" className="w-full rounded-xl border border-white/10 bg-black/20 p-2.5 text-sm text-foreground outline-none focus:border-cyan-300/50" /></div>}<p className="text-xs leading-5 text-muted-foreground">For a Cloudflare Tunnel or Zero Trust public hostname, enter the FQDN, enable HTTPS/TLS and Behind a reverse proxy. ShiroNex will call the public endpoint on 443 instead of appending the private daemon port. After creation, run the generated command as root on the node VPS.</p></div>
              <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => { setOpen(false); setEditingNode(null); }} className="snx-secondary-button">Cancel</button><button type="button" disabled={busy !== null || !form.name.trim() || !form.hostname.trim()} onClick={() => void saveNode()} className="snx-primary-button">{busy === `${editingNode?.id}:edit` ? "Saving…" : editingNode ? "Save changes" : "Create Node"}</button></div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
