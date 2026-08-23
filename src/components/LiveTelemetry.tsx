import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Cpu, Gauge, HardDrive, Info, Wifi } from "lucide-react";
import { EMPTY_TELEMETRY, TelemetrySnapshot } from "../types/telemetry";
import { formatBytes, formatCpu, formatNetworkRate, normalizeTelemetry } from "../utils/telemetry";

type ChartField = "cpu" | "memory" | "networkIn" | "networkOut" | "tps" | "mspt";
const MAX_SAMPLES = 30;
const POLL_MS = 3000;
const STALE_AFTER_MS = 15000;

const Chart = ({ samples, field, color, min = 0, max }: { samples: TelemetrySnapshot[]; field: ChartField; color: string; min?: number; max?: number }) => {
  const values = samples.map(sample => {
    if (field === "cpu") return sample.cpu.usagePercent;
    if (field === "memory") return sample.memory.usedBytes;
    if (field === "networkIn") return sample.network.downloadBytesPerSecond;
    if (field === "networkOut") return sample.network.uploadBytesPerSecond;
    return field === "tps" ? sample.tps : sample.mspt;
  }).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const top = max ?? Math.max(...values, min + 1);
  const bottom = max ? min : Math.min(...values, min);
  const range = Math.max(top - bottom, 1);
  const points = samples.map((sample, index) => {
    const raw = field === "cpu" ? sample.cpu.usagePercent : field === "memory" ? sample.memory.usedBytes : field === "networkIn" ? sample.network.downloadBytesPerSecond : field === "networkOut" ? sample.network.uploadBytesPerSecond : field === "tps" ? sample.tps : sample.mspt;
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : bottom;
    const x = samples.length > 1 ? (index / (samples.length - 1)) * 100 : 0;
    const y = 92 - ((Math.max(bottom, Math.min(top, value)) - bottom) / range) * 78;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full" aria-hidden="true">
      <defs><linearGradient id={`telemetry-fill-${field}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.32" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`M 0 100 L ${points || "0,92"} L 100 100 Z`} fill={`url(#telemetry-fill-${field})`} />
      <polyline points={points || "0,92 100,92"} fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MetricCard = ({ label, value, detail, icon: Icon, color, samples, field, chartMin, chartMax, unavailable }: any) => (
  <article className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-[0_16px_45px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl">
    <div className="mb-2 flex items-start justify-between gap-3">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-xl font-semibold text-foreground">{unavailable ? "--" : value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
      <span className="rounded-xl border border-white/10 bg-white/5 p-2" style={{ color }}><Icon className="h-4 w-4" /></span>
    </div>
    {unavailable ? <div className="flex h-16 items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />Telemetry unavailable</div> : <Chart samples={samples} field={field} color={color} min={chartMin} max={chartMax} />}
  </article>
);

export default function LiveTelemetry({ serverId, server }: { serverId: string; server: any }) {
  const [samples, setSamples] = useState<TelemetrySnapshot[]>([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [latest, setLatest] = useState<TelemetrySnapshot>(EMPTY_TELEMETRY);
  const latestRef = useRef<TelemetrySnapshot>(EMPTY_TELEMETRY);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    let requestId = 0;
    let controller: AbortController | null = null;

    const fetchStats = async () => {
      if (!mounted || document.visibilityState !== "visible") return;
      const id = ++requestId;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await axios.get(`/api/servers/${serverId}/stats`, { signal: controller.signal });
        if (!mounted || id !== requestId) return;
        const snapshot = normalizeTelemetry(response.data, latestRef.current, Date.now());
        latestRef.current = snapshot;
        setLatest(snapshot);
        setSamples(previous => [...previous, snapshot].slice(-MAX_SAMPLES));
        setLastUpdated(snapshot.timestamp);
        setError("");
      } catch (caught) {
        if (!mounted || axios.isCancel(caught)) return;
        setError("Reconnecting…");
        latestRef.current = { ...latestRef.current, status: "unavailable" };
        setLatest(previous => ({ ...previous, status: "unavailable" }));
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => { await fetchStats(); if (mounted) schedule(); }, POLL_MS);
    };
    void fetchStats();
    schedule();
    const onVisibility = () => { if (document.visibilityState === "visible") { void fetchStats(); } };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { mounted = false; controller?.abort(); if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [serverId]);

  const effectiveStatus = latest.timestamp && Date.now() - latest.timestamp > STALE_AFTER_MS ? "stale" : latest.status;
  const memoryHasValue = latest.memory.usedBytes !== null;
  const diskHasValue = latest.disk.usedBytes !== null;
  const networkInHasValue = latest.network.downloadBytesPerSecond !== null;
  const networkOutHasValue = latest.network.uploadBytesPerSecond !== null;
  const hasTps = samples.some(sample => sample.tps !== null);
  const hasMspt = samples.some(sample => sample.mspt !== null);
  const statusText = effectiveStatus === "live" ? (lastUpdated ? `Live · ${new Date(lastUpdated).toLocaleTimeString()}` : "Live") : effectiveStatus === "stale" ? "Stale telemetry" : error || "Telemetry unavailable";
  const statusColor = effectiveStatus === "live" ? "text-emerald-300" : effectiveStatus === "stale" ? "text-amber-300" : "text-rose-300";
  const diskValue = latest.disk.usedBytes === null ? "--" : formatBytes(latest.disk.usedBytes);
  const diskDetail = latest.disk.limitBytes === null ? "No disk counter from node" : `of ${formatBytes(latest.disk.limitBytes)}`;
  const memoryValue = latest.memory.usedBytes === null ? "--" : formatBytes(latest.memory.usedBytes);
  const memoryDetail = latest.memory.limitBytes === null ? "No memory limit" : `of ${formatBytes(latest.memory.limitBytes)}`;
  const cpuValue = latest.cpu.usagePercent === null ? "--" : formatCpu(latest.cpu.usagePercent);
  const cpuDetail = latest.cpu.capacityPercent === null ? "Container CPU usage" : `of ${formatCpu(latest.cpu.capacityPercent)}`;

  const samplesWithFallback = useMemo(() => samples.length ? samples : [EMPTY_TELEMETRY], [samples]);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 pb-10 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300"><span className={`h-2 w-2 rounded-full ${effectiveStatus === "live" ? "animate-pulse bg-emerald-300" : effectiveStatus === "stale" ? "bg-amber-300" : "bg-rose-300"}`} />Live telemetry</div><h2 className="text-2xl font-semibold tracking-tight text-foreground">Resource usage</h2><p className="mt-1 text-sm text-muted-foreground">{server?.name || "Server"} · sampled every 3 seconds while this view is visible.</p></div>
          <div className={`flex items-center gap-2 text-xs ${statusColor}`}><Wifi className="h-3.5 w-3.5" />{statusText}</div>
        </header>

        {effectiveStatus !== "live" && <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4 text-sm text-muted-foreground"><div className="flex items-start gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p><strong className="text-foreground">{effectiveStatus === "stale" ? "Stale telemetry." : "Telemetry unavailable."}</strong> ShiroNex will not substitute fake zero values while the node is offline or reconnecting.</p></div></div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="CPU" value={cpuValue} detail={cpuDetail} icon={Cpu} color="#00F2FE" samples={samplesWithFallback} field="cpu" chartMin={0} chartMax={latest.cpu.capacityPercent ?? 100} unavailable={latest.cpu.usagePercent === null} />
          <MetricCard label="Memory" value={memoryValue} detail={memoryDetail} icon={HardDrive} color="#9B51E0" samples={samplesWithFallback} field="memory" chartMin={0} unavailable={!memoryHasValue} />
          <MetricCard label="Network in" value={formatNetworkRate(latest.network.downloadBytesPerSecond)} detail={networkInHasValue ? "Download rate" : "No node counter"} icon={ArrowDownToLine} color="#00FF87" samples={samplesWithFallback} field="networkIn" chartMin={0} unavailable={!networkInHasValue} />
          <MetricCard label="Network out" value={formatNetworkRate(latest.network.uploadBytesPerSecond)} detail={networkOutHasValue ? "Upload rate" : "No node counter"} icon={ArrowUpFromLine} color="#f6c453" samples={samplesWithFallback} field="networkOut" chartMin={0} unavailable={!networkOutHasValue} />
        </div>

        <section><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Game performance</p><h3 className="mt-1 text-lg font-semibold text-foreground">TPS and MSPT</h3></div><span className="text-xs text-muted-foreground">Provider-backed only</span></div><div className="grid gap-4 sm:grid-cols-2"><MetricCard label="TPS" value={latest.tps === null ? "--" : latest.tps.toFixed(2)} detail="Requires a server metrics provider" icon={Gauge} color="#62d5ff" samples={samplesWithFallback} field="tps" chartMin={0} chartMax={20} unavailable={!hasTps} /><MetricCard label="MSPT" value={latest.mspt === null ? "--" : `${latest.mspt.toFixed(2)} ms`} detail="Requires a server metrics provider" icon={Activity} color="#ff7ab6" samples={samplesWithFallback} field="mspt" chartMin={0} unavailable={!hasMspt} /></div></section>

        <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.04] p-4 text-sm text-muted-foreground"><div className="flex items-start gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p><strong className="text-foreground">Metric source note.</strong> CPU, memory, and network use the existing local/remote node stats path. Disk remains unavailable unless the node reports a real disk counter. TPS and MSPT remain unavailable until the server exposes a compatible metrics provider.</p></div></div>
      </div>
    </div>
  );
}
