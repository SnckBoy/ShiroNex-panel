import React, { useEffect, useState } from "react";
import axios from "axios";
import { Activity, CheckCircle2, ClipboardList, Cpu, HardDrive, Plus, Power, RefreshCw, RotateCw, Server, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const staffRoles = ["admin", "owner"];

const statusClass = (status: string) => {
  if (status === "ONLINE") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-300";
  if (status === "MAINTENANCE") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
  if (status === "INSTALLING") return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  if (status === "ERROR") return "border-rose-400/25 bg-rose-400/10 text-rose-200";
  if (status === "DISABLED") return "border-slate-400/25 bg-slate-400/10 text-slate-300";
  return "border-rose-400/25 bg-rose-400/10 text-rose-300";
};

const ageLabel = (node: any) => {
  if (!node.lastHeartbeat) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(node.lastHeartbeat)) / 1000));
  return seconds < 2 ? "Just now" : `${seconds}s ago`;
};

export default function Nodes() {
  const { user } = useAuth();
  const [nodes, setNodes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", hostname: "", fqdn: "", publicIp: "", apiPort: "6768", location: "", tls: false, memory: "", disk: "", cpu: "", cloudflareZoneId: "", createCloudflareDns: false });

  const load = async () => {
    try {
      setNodes((await axios.get("/api/nodes")).data);
      setError("");
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Unable to load nodes.");
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  if (!staffRoles.includes(user?.role || "")) return <div className="p-10 text-center">You do not have permission to manage nodes.</div>;

  const create = async () => {
    setBusy("create");
    setError("");
    try {
      const response = await axios.post("/api/nodes", { ...form, apiPort: Number(form.apiPort), memory: Number(form.memory) || 0, disk: Number(form.disk) || 0, cpu: Number(form.cpu) || 0 });
      setCreated(response.data);
      setOpen(false);
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Node creation failed.");
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
      setError(requestError.response?.data?.error || `Node action failed: ${actionName}`);
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
      setError(requestError.response?.data?.error || "Node health check failed.");
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
          <button type="button" onClick={() => setOpen(true)} className="snx-primary-button"><Plus className="h-4 w-4" /> Create Node</button>
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
                  <div className="min-w-0"><h2 className="truncate font-semibold text-foreground">{node.name}</h2><p className="truncate font-mono text-xs text-muted-foreground">{node.fqdn || node.hostname}:{node.apiPort}</p><p className="mt-1 text-[11px] text-muted-foreground">{node.os || "Linux daemon"} · {node.architecture || "architecture pending"}</p></div>
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

      {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="snx-console-surface max-h-[90svh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 md:p-6"><h2 className="mb-4 text-xl font-semibold">Create Node</h2><div className="grid gap-3 md:grid-cols-2">{Object.entries(form).map(([key, value]) => key === "tls" || key === "createCloudflareDns" ? null : <input key={key} placeholder={key} value={String(value)} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" />)}</div><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={form.createCloudflareDns} onChange={(event) => setForm({ ...form, createCloudflareDns: event.target.checked })} /> Create Cloudflare DNS automatically</label><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={form.tls} onChange={(event) => setForm({ ...form, tls: event.target.checked })} /> TLS enabled</label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="snx-secondary-button">Cancel</button><button type="button" disabled={busy === "create"} onClick={() => void create()} className="snx-primary-button">{busy === "create" ? "Creating…" : "Create"}</button></div></div></div>}
    </div>
  );
}
