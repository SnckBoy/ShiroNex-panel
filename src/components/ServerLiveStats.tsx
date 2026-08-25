import { useEffect, useState } from "react";
import axios from "axios";

type LiveStats = {
  available?: boolean;
  cpu?: number | null;
  ram?: number | null;
  disk?: { used?: number; total?: number } | null;
  networkRxBytes?: number | null;
  networkTxBytes?: number | null;
};

type Props = { serverId: string; limitRam?: number; limitCpu?: number; limitDisk?: number; status?: string };

const formatRam = (value: number | null | undefined) => value == null ? "—" : `${(value / 1024).toFixed(1)} GB`;
const formatDisk = (value: number | null | undefined) => value == null ? "—" : `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
const formatRate = (value: number | null | undefined) => value == null ? "—" : `${(value / 1024 / 1024).toFixed(1)} MB`;

export default function ServerLiveStats({ serverId, limitRam, limitCpu, limitDisk, status }: Props) {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const response = await axios.get<LiveStats>(`/api/servers/${serverId}/stats`);
        if (active) setStats(response.data);
      } catch {
        if (active) setStats(null);
      }
    };
    void fetchStats();
    const interval = window.setInterval(() => void fetchStats(), 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [serverId]);

  const waiting = !stats || stats.available === false;
  const liveCpu = stats?.cpu == null ? null : stats.cpu;
  const liveRam = stats?.ram == null ? null : stats.ram;
  const diskUsed = stats?.disk?.used == null ? null : stats.disk.used;
  const label = waiting ? (status === "online" ? "Waiting for node data" : "Unavailable") : "Live";

  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
    <span className="text-muted-foreground">CPU <b className="ml-1 font-mono text-foreground">{liveCpu == null ? "—" : `${liveCpu.toFixed(1)}%`}</b>{limitCpu != null && <small className="ml-1 text-muted-foreground">/ {limitCpu}%</small>}</span>
    <span className="text-muted-foreground">RAM <b className="ml-1 font-mono text-foreground">{formatRam(liveRam)}</b>{limitRam != null && <small className="ml-1 text-muted-foreground">/ {limitRam}G</small>}</span>
    <span className="text-muted-foreground">Disk <b className="ml-1 font-mono text-foreground">{formatDisk(diskUsed)}</b>{limitDisk != null && <small className="ml-1 text-muted-foreground">/ {limitDisk}G</small>}</span>
    <span className="text-muted-foreground">Net <b className="ml-1 font-mono text-foreground">↓ {formatRate(stats?.networkRxBytes)} · ↑ {formatRate(stats?.networkTxBytes)}</b></span>
    <span className={`col-span-2 text-[10px] uppercase tracking-[0.12em] ${waiting ? "text-amber-200" : "text-emerald-300"}`}>{label}</span>
  </div>;
}
