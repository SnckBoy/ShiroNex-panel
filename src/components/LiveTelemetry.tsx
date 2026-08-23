import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, ArrowDownToLine, ArrowUpFromLine, Cpu, Gauge, HardDrive, Info, Wifi } from "lucide-react";

type TelemetrySample = {
  at: number;
  cpu: number;
  ram: number;
  networkRx: number;
  networkTx: number;
  tps: number | null;
  mspt: number | null;
};

type Props = {
  serverId: string;
  server: any;
};

const MAX_SAMPLES = 30;
const POLL_MS = 3000;

const asNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const networkValue = (payload: any, direction: "rx" | "tx") => {
  const direct = asNumber(payload?.[`network${direction === "rx" ? "Rx" : "Tx"}Bytes`]);
  if (direct !== null) return direct;
  const nested = asNumber(payload?.network?.[`${direction}Bytes`]);
  return nested ?? 0;
};

const formatBytesPerSecond = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const Chart = ({ samples, field, color, min = 0, max }: { samples: TelemetrySample[]; field: "cpu" | "ram" | "networkRx" | "networkTx" | "tps" | "mspt"; color: string; min?: number; max?: number }) => {
  const values = samples.map(sample => sample[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const calculatedMax = max ?? Math.max(...values, min + 1);
  const calculatedMin = max ? min : Math.min(...values, min);
  const range = Math.max(calculatedMax - calculatedMin, 1);
  const points = samples.map((sample, index) => {
    const value = sample[field];
    const safe = typeof value === "number" && Number.isFinite(value) ? value : calculatedMin;
    const x = samples.length > 1 ? (index / (samples.length - 1)) * 100 : 0;
    const y = 92 - ((Math.max(calculatedMin, Math.min(calculatedMax, safe)) - calculatedMin) / range) * 78;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={`telemetry-fill-${field}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M 0 100 L ${points || "0,92"} L 100 100 Z`} fill={`url(#telemetry-fill-${field})`} />
      <polyline points={points || "0,92 100,92"} fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MetricCard = ({ label, value, detail, icon: Icon, color, samples, field, chartMin, chartMax, unavailable }: any) => (
  <article className="rounded-2xl border border-white/10 bg-black/20 p-4 shadow-[0_16px_45px_-25px_rgba(0,0,0,0.9)] backdrop-blur-xl">
    <div className="mb-2 flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold text-foreground">{unavailable ? "—" : value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="rounded-xl border border-white/10 bg-white/5 p-2" style={{ color }}><Icon className="h-4 w-4" /></span>
    </div>
    {unavailable ? (
      <div className="flex h-16 items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5 shrink-0" />Waiting for server telemetry</div>
    ) : <Chart samples={samples} field={field} color={color} min={chartMin} max={chartMax} />}
  </article>
);

export default function LiveTelemetry({ serverId, server }: Props) {
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;

    const fetchStats = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await axios.get(`/api/servers/${serverId}/stats`);
        if (!mounted) return;
        const payload = response.data || {};
        const telemetry = payload.telemetry || {};
        const sample: TelemetrySample = {
          at: Date.now(),
          cpu: Math.max(0, asNumber(payload.cpu) ?? 0),
          ram: Math.max(0, asNumber(payload.ram) ?? 0),
          networkRx: Math.max(0, networkValue(payload, "rx")),
          networkTx: Math.max(0, networkValue(payload, "tx")),
          tps: asNumber(payload.tps ?? telemetry.tps),
          mspt: asNumber(payload.mspt ?? telemetry.mspt),
        };
        setSamples(previous => [...previous, sample].slice(-MAX_SAMPLES));
        setLastUpdated(sample.at);
        setError("");
      } catch {
        if (mounted) setError("Telemetry temporarily unavailable");
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await fetchStats();
        if (mounted) schedule();
      }, POLL_MS);
    };

    void fetchStats();
    schedule();
    const onVisibility = () => { if (document.visibilityState === "visible") void fetchStats(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [serverId]);

  const latest = samples[samples.length - 1];
  const networkRxRate = useMemo(() => {
    if (samples.length < 2) return 0;
    const current = samples[samples.length - 1];
    const previous = samples[samples.length - 2];
    return Math.max(0, (current.networkRx - previous.networkRx) / Math.max((current.at - previous.at) / 1000, 0.1));
  }, [samples]);
  const networkTxRate = useMemo(() => {
    if (samples.length < 2) return 0;
    const current = samples[samples.length - 1];
    const previous = samples[samples.length - 2];
    return Math.max(0, (current.networkTx - previous.networkTx) / Math.max((current.at - previous.at) / 1000, 0.1));
  }, [samples]);
  const hasTps = samples.some(sample => sample.tps !== null);
  const hasMspt = samples.some(sample => sample.mspt !== null);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300"><span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />Live telemetry</div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Runtime health</h2>
            <p className="mt-1 text-sm text-muted-foreground">{server?.name || "Server"} · sampled every 3 seconds while this view is open.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wifi className="h-3.5 w-3.5 text-emerald-300" />{error || (lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : "Connecting…")}</div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="CPU load" value={`${(latest?.cpu ?? 0).toFixed(1)}%`} detail="Container CPU usage" icon={Cpu} color="#00F2FE" samples={samples} field="cpu" chartMin={0} chartMax={100} />
          <MetricCard label="Memory" value={`${(latest?.ram ?? 0).toFixed(0)} MB`} detail="Container resident memory" icon={HardDrive} color="#9B51E0" samples={samples} field="ram" chartMin={0} />
          <MetricCard label="Network in" value={formatBytesPerSecond(networkRxRate)} detail="Measured from Docker counters" icon={ArrowDownToLine} color="#00FF87" samples={samples} field="networkRx" chartMin={0} />
          <MetricCard label="Network out" value={formatBytesPerSecond(networkTxRate)} detail="Measured from Docker counters" icon={ArrowUpFromLine} color="#f6c453" samples={samples} field="networkTx" chartMin={0} />
          <MetricCard label="TPS" value={latest?.tps?.toFixed(2)} detail="Requires a server metric provider" icon={Gauge} color="#62d5ff" samples={samples} field="tps" chartMin={0} chartMax={20} unavailable={!hasTps} />
          <MetricCard label="MSPT" value={`${latest?.mspt?.toFixed(2)} ms`} detail="Requires a server metric provider" icon={Activity} color="#ff7ab6" samples={samples} field="mspt" chartMin={0} unavailable={!hasMspt} />
        </div>

        <div className="rounded-2xl border border-cyan-400/10 bg-cyan-400/[0.04] p-4 text-sm text-muted-foreground">
          <div className="flex items-start gap-3"><Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><p><strong className="text-foreground">Metric source note.</strong> CPU, memory, and network are read from the container/node telemetry path. TPS and MSPT remain unavailable until the server exposes a compatible metrics provider; ShiroNex does not fabricate those values.</p></div>
        </div>
      </div>
    </div>
  );
}
