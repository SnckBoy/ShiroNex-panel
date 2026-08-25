import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link2, Plus, Server, Trash2, Unlink } from "lucide-react";

type Allocation = { id: string; nodeId: string; ip: string; ipVersion: "IPv4" | "IPv6"; portStart: number; portEnd: number; assignedServerId?: string | null; primary?: boolean };
type NodeRecord = { id: string; name: string; status?: string };
type ServerRecord = { id: string; name: string; nodeId?: string; port?: number };

export default function Allocations() {
  const queryNodeId = useMemo(() => new URLSearchParams(window.location.search).get("nodeId") || "", []);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [nodeId, setNodeId] = useState(queryNodeId);
  const [form, setForm] = useState({ ip: "", portStart: "25565", portEnd: "25565", ipVersion: "IPv4" as "IPv4" | "IPv6", primary: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [allocationResponse, nodeResponse, serverResponse] = await Promise.all([axios.get<Allocation[]>("/api/allocations"), axios.get<NodeRecord[]>("/api/nodes"), axios.get<ServerRecord[]>("/api/servers")]);
      setAllocations(allocationResponse.data || []);
      setNodes(nodeResponse.data || []);
      setServers(serverResponse.data || []);
      if (!nodeId && nodeResponse.data?.[0]) setNodeId(nodeResponse.data[0].id);
      setError("");
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Unable to load allocations.");
    }
  };

  useEffect(() => { void load(); }, []);
  const visibleAllocations = allocations.filter((allocation) => !nodeId || allocation.nodeId === nodeId);
  const nodeServers = servers.filter((server) => String(server.nodeId || "local") === String(nodeId));

  const add = async () => {
    if (!nodeId) return setError("Select a node first.");
    setBusy(true);
    try { await axios.post("/api/allocations", { nodeId, ...form, portStart: Number(form.portStart), portEnd: Number(form.portEnd) }); setForm((current) => ({ ...current, ip: "", primary: false })); await load(); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "Allocation creation failed."); }
    finally { setBusy(false); }
  };
  const assign = async (allocationId: string, serverId: string) => {
    if (!serverId) return;
    setBusy(true);
    try { await axios.post(`/api/allocations/${allocationId}/assign`, { serverId }); await load(); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "Allocation assignment failed."); }
    finally { setBusy(false); }
  };
  const unassign = async (allocation: Allocation) => {
    setBusy(true);
    try { await axios.post(`/api/allocations/${allocation.id}/unassign`); await load(); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "Allocation unassignment failed."); }
    finally { setBusy(false); }
  };
  const makePrimary = async (allocation: Allocation) => {
    setBusy(true);
    try { await axios.post(`/api/allocations/${allocation.id}/primary`); await load(); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "Primary allocation update failed."); }
    finally { setBusy(false); }
  };
  const remove = async (allocation: Allocation) => {
    if (allocation.assignedServerId || !window.confirm("Delete this allocation?")) return;
    setBusy(true);
    try { await axios.delete(`/api/allocations/${allocation.id}`); await load(); }
    catch (requestError: any) { setError(requestError.response?.data?.error || "Allocation deletion failed."); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <header className="mb-6"><p className="snx-eyebrow"><Link2 className="h-3.5 w-3.5" /> Node management</p><h1 className="snx-page-title">Allocations</h1><p className="snx-page-subtitle">Reserve unique IP and port ranges on a selected node, then assign them to one server.</p></header>
    {error && <div role="alert" className="mb-5 rounded-xl border border-rose-400/25 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</div>}
    <section className="snx-console-surface mb-6 rounded-2xl p-4 md:p-5"><div className="grid gap-3 md:grid-cols-6"><select value={nodeId} onChange={(event) => setNodeId(event.target.value)} className="rounded-xl border border-border bg-background p-3 text-sm"><option value="">Select node</option>{nodes.map((node) => <option value={node.id} key={node.id}>{node.name} · {node.status || "unknown"}</option>)}</select><input placeholder="IP address" value={form.ip} onChange={(event) => setForm({ ...form, ip: event.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" /><input type="number" min="1" max="65535" placeholder="Start port" value={form.portStart} onChange={(event) => setForm({ ...form, portStart: event.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" /><input type="number" min="1" max="65535" placeholder="End port" value={form.portEnd} onChange={(event) => setForm({ ...form, portEnd: event.target.value })} className="rounded-xl border border-border bg-background p-3 text-sm" /><select value={form.ipVersion} onChange={(event) => setForm({ ...form, ipVersion: event.target.value as "IPv4" | "IPv6" })} className="rounded-xl border border-border bg-background p-3 text-sm"><option value="IPv4">IPv4</option><option value="IPv6">IPv6</option></select><button type="button" disabled={busy} onClick={() => void add()} className="snx-primary-button"><Plus className="h-4 w-4" /> Add</button></div><label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={form.primary} onChange={(event) => setForm({ ...form, primary: event.target.checked })} /> Mark as primary allocation</label></section>
    <section className="space-y-3">{visibleAllocations.length === 0 ? <div className="snx-console-surface rounded-2xl border-dashed p-10 text-center text-sm text-muted-foreground">No allocations exist for this node yet.</div> : visibleAllocations.map((allocation) => { const assigned = servers.find((server) => server.id === allocation.assignedServerId); return <article key={allocation.id} className="snx-console-surface flex flex-col gap-4 rounded-2xl p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Server className="h-4 w-4 text-cyan-300" /><b className="font-mono text-sm">{allocation.ip}:{allocation.portStart}{allocation.portEnd !== allocation.portStart ? `-${allocation.portEnd}` : ""}</b>{allocation.primary && <span className="rounded-full bg-violet-300/10 px-2 py-0.5 text-[10px] text-violet-200">Primary</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] ${assigned ? "bg-amber-300/10 text-amber-200" : "bg-emerald-300/10 text-emerald-200"}`}>{assigned ? `Assigned · ${assigned.name}` : "Available"}</span></div><p className="mt-1 text-xs text-muted-foreground">{allocation.ipVersion} · Node {nodes.find((node) => node.id === allocation.nodeId)?.name || allocation.nodeId}</p></div><div className="flex flex-wrap gap-2">{assigned ? <button type="button" disabled={busy} onClick={() => void unassign(allocation)} className="snx-secondary-button"><Unlink className="h-3.5 w-3.5" /> Unassign</button> : <select defaultValue="" disabled={busy || nodeServers.length === 0} onChange={(event) => void assign(allocation.id, event.target.value)} className="rounded-xl border border-border bg-background px-3 py-2 text-xs"><option value="">Assign server</option>{nodeServers.map((server) => <option key={server.id} value={server.id}>{server.name} · {server.port || "—"}</option>)}</select>} {!allocation.primary && <button type="button" disabled={busy} onClick={() => void makePrimary(allocation)} className="snx-secondary-button">Make primary</button>}<button type="button" disabled={busy || Boolean(assigned)} onClick={() => void remove(allocation)} className="snx-secondary-button text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div></article>; })}</section>
  </div>;
}
