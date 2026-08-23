import React, { useMemo, useState } from "react";
import { Check, Gavel, RefreshCw, Search, Shield, ShieldAlert, UserMinus, Users, UserX, Wifi } from "lucide-react";
import axios from "axios";

export interface ManagedPlayer {
  name: string;
  uuid?: string | null;
  ping?: number | null;
  playtime?: string | null;
  online?: boolean;
  operator?: boolean;
  whitelisted?: boolean;
}

type Filter = "all" | "online" | "offline" | "operators" | "whitelisted";
type Sort = "name" | "ping" | "playtime";

export default function PlayerManager({ serverId, players, maxPlayers = null, connected = false, onRefresh }: { serverId: string; players: ManagedPlayer[]; maxPlayers?: number | null; connected?: boolean; onRefresh?: () => Promise<void> | void }) {
  const [loadingAction, setLoadingAction] = useState<{ player: string; action: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");

  const runCommand = async (player: ManagedPlayer, action: string, command: string, confirm = false) => {
    if (confirm && !window.confirm(`${action} ${player.name}? This sends a privileged server command.`)) return;
    try {
      setLoadingAction({ player: player.name, action });
      await axios.post(`/api/servers/${serverId}/command`, { command });
    } catch (error) {
      console.error(error);
    } finally {
      window.setTimeout(() => setLoadingAction(null), 700);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await axios.post(`/api/servers/${serverId}/command`, { command: "list" });
      await onRefresh?.();
    } catch (error) {
      console.error(error);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const visiblePlayers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...players]
      .filter(player => !normalized || player.name.toLowerCase().includes(normalized) || player.uuid?.toLowerCase().includes(normalized))
      .filter(player => filter === "all" || filter === "online" && player.online !== false || filter === "offline" && player.online === false || filter === "operators" && player.operator === true || filter === "whitelisted" && player.whitelisted === true)
      .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "ping" ? (a.ping ?? Number.POSITIVE_INFINITY) - (b.ping ?? Number.POSITIVE_INFINITY) : String(a.playtime ?? "").localeCompare(String(b.playtime ?? "")));
  }, [filter, players, query, sort]);

  const onlineCount = players.filter(player => player.online !== false).length;
  const progress = maxPlayers && maxPlayers > 0 ? Math.min(100, (onlineCount / maxPlayers) * 100) : null;

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-white/10 bg-black/20 p-4 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-6">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300"><Users className="h-3.5 w-3.5" />Player management</div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Players</h2>
          <p className="mt-1 text-sm text-muted-foreground">Online presence and administrative actions from the server command channel.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-emerald-300" : "bg-rose-300"}`} />{connected ? "Live" : "Reconnecting"}<button type="button" onClick={() => void handleRefresh()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-foreground transition hover:border-cyan-300/30 hover:bg-cyan-300/10" disabled={isRefreshing}><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />Refresh</button></div>
      </header>

      <div className="grid gap-3 py-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Online</p><p className="mt-1 font-mono text-2xl font-semibold text-emerald-200">{onlineCount}</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Maximum</p><p className="mt-1 font-mono text-2xl font-semibold text-foreground">{maxPlayers ?? "--"}</p></div>
        <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4"><p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Capacity</p><p className="mt-1 font-mono text-2xl font-semibold text-cyan-200">{progress === null ? "--" : `${Math.round(progress)}%`}</p>{progress !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-cyan-300 transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>}</div>
      </div>

      <div className="flex flex-col gap-3 pb-4 md:flex-row"><label className="relative flex min-w-0 flex-1 items-center"><Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search players or UUID…" className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-cyan-300/40" /></label><select value={filter} onChange={event => setFilter(event.target.value as Filter)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none"><option value="all">All players</option><option value="online">Online</option><option value="offline">Offline</option><option value="operators">Operators</option><option value="whitelisted">Whitelisted</option></select><select value={sort} onChange={event => setSort(event.target.value as Sort)} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-foreground outline-none"><option value="name">Sort by name</option><option value="ping">Sort by ping</option><option value="playtime">Sort by playtime</option></select></div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="grid gap-3 xl:grid-cols-2">{visiblePlayers.length === 0 ? <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-3 h-7 w-7 opacity-60" />No player records are available for this filter.</div> : visiblePlayers.map(player => { const busy = loadingAction?.player === player.name; return <article key={player.uuid || player.name} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.04]"><div className="flex items-start gap-3"><img src={`https://minotar.net/avatar/${encodeURIComponent(player.name)}/40.png`} alt="" className="h-10 w-10 rounded-xl border border-white/10 bg-black/30" onError={event => { event.currentTarget.style.visibility = "hidden"; }} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-foreground">{player.name}</h3><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${player.online === false ? "bg-white/5 text-muted-foreground" : "bg-emerald-300/10 text-emerald-200"}`}><span className={`h-1.5 w-1.5 rounded-full ${player.online === false ? "bg-muted-foreground" : "bg-emerald-300"}`} />{player.online === false ? "Offline" : "Online"}</span>{player.operator && <span className="rounded-full bg-violet-300/10 px-2 py-0.5 text-[10px] text-violet-200">OP</span>}</div><p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">UUID: {player.uuid || "--"}</p><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span>Ping: {player.ping == null ? "--" : `${player.ping} ms`}</span><span>Playtime: {player.playtime || "--"}</span></div></div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5"><button type="button" disabled={!!busy} onClick={() => void runCommand(player, "Kick", `kick ${player.name} Kicked by admin.`, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-amber-300/15 bg-amber-300/[0.05] px-2 py-2 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-300/10 disabled:opacity-40"><UserMinus className="h-3 w-3" />Kick</button><button type="button" disabled={!!busy} onClick={() => void runCommand(player, "Ban", `ban ${player.name} Banned by admin.`, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-rose-300/15 bg-rose-300/[0.05] px-2 py-2 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-40"><Gavel className="h-3 w-3" />Ban</button><button type="button" disabled={!!busy} onClick={() => void runCommand(player, player.operator ? "De-OP" : "OP", `${player.operator ? "deop" : "op"} ${player.name}`, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-violet-300/15 bg-violet-300/[0.05] px-2 py-2 text-[11px] font-semibold text-violet-200 transition hover:bg-violet-300/10 disabled:opacity-40"><Shield className="h-3 w-3" />{player.operator ? "De-OP" : "OP"}</button><button type="button" disabled={!!busy} onClick={() => void runCommand(player, player.whitelisted ? "Remove whitelist" : "Whitelist", `whitelist ${player.whitelisted ? "remove" : "add"} ${player.name}`, false)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.05] px-2 py-2 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-300/10 disabled:opacity-40"><Check className="h-3 w-3" />{player.whitelisted ? "Remove" : "Whitelist"}</button><button type="button" disabled={!!busy} onClick={() => void runCommand(player, "Unban", `pardon ${player.name}`, true)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-[11px] font-semibold text-muted-foreground transition hover:bg-white/10 disabled:opacity-40"><UserX className="h-3 w-3" />Unban</button></div>{busy && <p className="mt-2 flex items-center gap-1 text-[11px] text-cyan-200"><Wifi className="h-3 w-3 animate-pulse" />Sending command…</p>}</article>; })}</div></div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />Actions are submitted through the authenticated server command endpoint. Backend access checks remain authoritative; the interface does not grant permissions by itself.</p>
    </section>
  );
}
