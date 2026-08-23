import React, { useState, useEffect, useMemo } from 'react';
import {
  Server, Cpu, HardDrive, Activity, Terminal, Play,
  Square, RotateCw, Search, LayoutGrid, List, Shield, Globe, Clock, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useDashboardData } from '../hooks/useDashboardData';
import { useSettings } from '../context/SettingsContext';
import PulseRing from '../components/PulseRing';
import InfrastructureCore from '../components/InfrastructureCore';

const SparklineChart = ({ data, color }: { data: number[]; color: string }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - (((value - min) / range) * 80 + 10);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="snx-metric-sparkline" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={`0,100 ${points} 100,100`} fill={color} fillOpacity="0.08" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const config: Record<string, { text: string; dot: string; anim: string }> = {
    online: { text: 'Online', dot: 'snx-status-dot--online', anim: 'snx-status-pulse' },
    offline: { text: 'Offline', dot: 'snx-status-dot--offline', anim: '' },
    starting: { text: 'Starting', dot: 'snx-status-dot--starting', anim: 'snx-status-pulse' },
    stopping: { text: 'Stopping', dot: 'snx-status-dot--stopping', anim: 'snx-status-pulse' },
    restarting: { text: 'Restarting', dot: 'snx-status-dot--restarting', anim: 'snx-status-pulse' },
  };
  const current = config[status] || config.offline;

  return (
    <span className={`snx-status-pill snx-status-pill--${status}`}>
      <span className="snx-status-dot-wrap" aria-hidden="true">
        {current.anim && <span className={`snx-status-dot snx-status-dot--halo ${current.dot} ${current.anim}`} />}
        <span className={`snx-status-dot ${current.dot}`} />
      </span>
      {current.text}
    </span>
  );
};

export default function Dashboard() {
  const { panelName } = useSettings();
  const { stats, statsHistory, servers: realServers, refetch } = useDashboardData();
  const [servers, setServers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const navigate = useNavigate();
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (realServers && Array.isArray(realServers)) {
      setServers(realServers.map((server) => ({
        id: server.id,
        name: server.name,
        type: (server.software || 'Unknown') + (server.version ? ` ${server.version}` : ''),
        ip: server.ipAlias || `${window.location.hostname}:${server.port || 25565}`,
        status: server.status,
        cpu: server.cpu || 0,
        ram: { used: server.memory || 0, total: 4096 },
        uptime: isNaN(Number((server as any).uptime)) ? '-' : `${Math.floor(Number((server as any).uptime) / 3600)}h ${Math.floor((Number((server as any).uptime) % 3600) / 60)}m`,
      })));
    }
  }, [realServers]);

  const STATS = useMemo(() => {
    const defaultData = Array(20).fill(0);
    const activeContainers = stats?.activeContainers || 0;
    const totalContainers = stats?.totalContainers || 0;
    const cpuData = statsHistory?.length ? statsHistory.map((item: any) => item.cpuUsage || 0) : defaultData;
    const ramData = statsHistory?.length ? statsHistory.map((item: any) => item.ramUsage || 0) : defaultData;
    const containersData = statsHistory?.length ? statsHistory.map((item: any) => item.activeContainers || 0) : defaultData;
    while (cpuData.length < 2) cpuData.unshift(0);
    while (ramData.length < 2) ramData.unshift(0);
    while (containersData.length < 2) containersData.unshift(0);

    return [
      { id: 'cpu', label: 'Cluster CPU', value: `${(stats?.cpuUsage || 0).toFixed(1)}%`, ringValue: stats?.cpuUsage || 0, data: cpuData, color: '#00F2FE', icon: Cpu, caption: 'aggregate load' },
      { id: 'ram', label: 'Memory Usage', value: `${(stats?.ramUsage || 0).toFixed(1)}%`, ringValue: stats?.ramUsage || 0, data: ramData, color: '#9B51E0', icon: HardDrive, caption: 'allocated capacity' },
      { id: 'net', label: 'Servers Online', value: `${(Array.isArray(realServers) ? realServers : []).filter((server) => server.status === 'online').length} / ${(Array.isArray(realServers) ? realServers : []).length}`, ringValue: (Array.isArray(realServers) && realServers.length) ? (realServers.filter((server) => server.status === 'online').length / realServers.length) * 100 : 0, data: defaultData, color: '#00FF87', icon: Activity, caption: 'healthy instances' },
      { id: 'nodes', label: 'Active Containers', value: `${activeContainers} / ${totalContainers}`, ringValue: totalContainers ? (activeContainers / totalContainers) * 100 : 0, data: containersData, color: '#f6c453', icon: Zap, caption: 'running workloads' },
    ];
  }, [stats, statsHistory, realServers]);

  const handleAction = async (id: string, action: string) => {
    setActionInProgress((previous) => ({ ...previous, [id]: true }));
    try {
      await axios.post(`/api/servers/${id}/${action}`);
      refetch();
    } catch (error) {
      console.error('Action failed', error);
      alert('Failed to execute action');
    } finally {
      setActionInProgress((previous) => ({ ...previous, [id]: false }));
    }
  };

  const filteredServers = useMemo(() => {
    const query = search.toLowerCase();
    return servers.filter((server) => server.name.toLowerCase().includes(query) || server.id.toLowerCase().includes(query) || server.ip.includes(search));
  }, [search, servers]);

  return (
    <div className="dashboard-shell snx-dashboard-page min-h-screen text-foreground font-sans selection:bg-cyan-400/20 overflow-x-hidden">
      <div className="dashboard-ambient snx-dashboard-ambient fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="snx-ambient-orb snx-ambient-orb--purple" />
        <div className="snx-ambient-orb snx-ambient-orb--cyan" />
        <div className="snx-dashboard-grid" />
      </div>

      <div className="snx-dashboard-inner relative z-10 mx-auto">
        <header className="snx-dashboard-header">
          <div className="snx-page-heading">
            <div className="snx-brand-mark snx-brand-mark--dashboard"><Server className="h-5 w-5" /></div>
            <div className="min-w-0">
              <div className="snx-eyebrow"><span className="snx-live-dot" /> Control plane / overview</div>
              <h1 className="snx-page-title truncate">{panelName || 'Panel Control'}</h1>
              <p className="snx-page-subtitle">Global infrastructure telemetry and deployed instances.</p>
            </div>
          </div>

          <div className="snx-dashboard-tools">
            <label className="snx-search-field">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Search servers</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search servers..." />
              <kbd>/</kbd>
            </label>
            <div className="snx-view-toggle" aria-label="Server view">
              <button type="button" onClick={() => setView('grid')} className={view === 'grid' ? 'is-active' : ''} aria-label="Grid view"><LayoutGrid className="h-4 w-4" /></button>
              <button type="button" onClick={() => setView('list')} className={view === 'list' ? 'is-active' : ''} aria-label="List view"><List className="h-4 w-4" /></button>
            </div>
          </div>
        </header>

        <section className="snx-dashboard-core-hero" aria-label="Infrastructure Core">
          <InfrastructureCore
            servers={servers.map((server) => ({ id: server.id, name: server.name, status: server.status, load: server.cpu }))}
            size="hero"
            label="Fleet Infrastructure Core"
          />
        </section>

        <section className="snx-metric-grid" aria-label="Cluster metrics">
          {STATS.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.article
                key={stat.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.07, duration: 0.45 }}
                className={`dashboard-stat-card qx-stat-card snx-metric-card snx-metric-card--${stat.id}`}
              >
                <div className="snx-card-sheen" aria-hidden="true" />
                <div className="snx-metric-card-header">
                  <div>
                    <p className="snx-card-label">{stat.label}</p>
                    <p className="snx-metric-value">{stat.value}</p>
                    <p className="snx-card-caption">{stat.caption}</p>
                  </div>
                  <div className="snx-metric-card-tools"><PulseRing value={stat.ringValue} size={50} label={stat.label} /><div className="snx-metric-icon" style={{ color: stat.color, ['--snx-icon-color' as string]: stat.color }}><Icon className="h-4 w-4" /></div></div>
                </div>
                <div className="snx-metric-chart"><SparklineChart data={stat.data} color={stat.color} /></div>
              </motion.article>
            );
          })}
        </section>

        <section className="snx-server-section">
          <div className="snx-section-heading">
            <div>
              <div className="snx-eyebrow">Runtime inventory</div>
              <h2 className="snx-section-title"><Server className="h-5 w-5" /> Deployed instances <span>{filteredServers.length}</span></h2>
            </div>
            <div className="snx-section-meta"><span className="snx-live-dot" /> polling live</div>
          </div>

          <motion.div layout className={view === 'grid' ? 'snx-server-grid' : 'snx-server-list'}>
            <AnimatePresence mode="popLayout">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  view={view}
                  isBusy={actionInProgress[server.id] || ['starting', 'stopping', 'restarting'].includes(server.status)}
                  onAction={(action: string) => handleAction(server.id, action)}
                  onOpenTerminal={() => navigate(`/servers/${server.id}`)}
                />
              ))}
            </AnimatePresence>
            {filteredServers.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="snx-empty-state">
                <Search className="h-7 w-7" />
                <strong>No instances match your search.</strong>
                <span>Try a server name, ID, or address.</span>
              </motion.div>
            )}
          </motion.div>
        </section>
      </div>
    </div>
  );
}

const ServerCard = ({ server, view, isBusy, onAction, onOpenTerminal }: any) => {
  if (view === 'list') {
    return (
      <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="dashboard-server-card snx-server-row">
        <div className="snx-server-identity">
          <StatusPill status={server.status} />
          <div className="min-w-0"><h3>{server.name}</h3><p>{server.id}</p></div>
        </div>
        <div className="snx-server-facts">
          <div><span>Address</span><strong>{server.ip}</strong></div>
          <div><span>Runtime</span><strong>{server.type}</strong></div>
          <div className="snx-list-resources">
            <div className="snx-resource-ring-row"><PulseRing value={server.cpu} size={44} label={`${server.name} CPU`} /><span><small>CPU</small><b>{Math.round(server.cpu)}%</b></span></div>
            <div className="snx-resource-ring-row"><PulseRing value={(server.ram.used / server.ram.total) * 100} size={44} label={`${server.name} memory`} /><span><small>RAM</small><b>{(server.ram.used / 1024).toFixed(1)}G</b></span></div>
          </div>
        </div>
        <div className="snx-server-actions"><ActionButtons status={server.status} isBusy={isBusy} onAction={onAction} /><ConsoleButton onOpenTerminal={onOpenTerminal} /></div>
      </motion.article>
    );
  }

  return (
    <motion.article layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} className="dashboard-server-card snx-server-card">
      <div className="snx-server-card-topline" aria-hidden="true" />
      <div className="snx-server-card-heading">
        <div className="min-w-0"><h3>{server.name}</h3><p className="snx-server-id">{server.id}</p></div>
        <StatusPill status={server.status} />
      </div>
      <div className="snx-server-address"><Globe className="h-3.5 w-3.5" /><span>{server.ip}</span><button type="button" aria-label={`Open ${server.name} console`} onClick={onOpenTerminal}><Terminal className="h-3.5 w-3.5" /></button></div>
      <div className="snx-server-type"><Shield className="h-3.5 w-3.5" /> {server.type}</div>
      <div className="snx-resource-stack">
        <div className="snx-resource-ring-row"><PulseRing value={server.cpu} size={58} label={`${server.name} CPU`} /><div><span><Cpu className="h-3.5 w-3.5" /> CPU load</span><b>{Math.round(server.cpu)}%</b></div></div>
        <div className="snx-resource-ring-row"><PulseRing value={(server.ram.used / server.ram.total) * 100} size={58} label={`${server.name} memory`} /><div><span><HardDrive className="h-3.5 w-3.5" /> Memory</span><b>{(server.ram.used / 1024).toFixed(1)} / {(server.ram.total / 1024).toFixed(1)} GB</b></div></div>
      </div>
      <div className="snx-server-card-footer"><span><Clock className="h-3.5 w-3.5" /> uptime {server.uptime}</span><div className="snx-server-actions"><ActionButtons status={server.status} isBusy={isBusy} onAction={onAction} /><ConsoleButton onOpenTerminal={onOpenTerminal} /></div></div>
    </motion.article>
  );
};

const ConsoleButton = ({ onOpenTerminal }: { onOpenTerminal: () => void }) => (
  <button type="button" onClick={onOpenTerminal} className="snx-icon-button snx-icon-button--console" title="Open console" aria-label="Open console"><Terminal className="h-4 w-4" /></button>
);

const ActionButtons = ({ status, isBusy, onAction }: any) => {
  const isOnline = status === 'online';
  return isOnline ? (
    <>
      <button type="button" onClick={() => onAction('restart')} disabled={isBusy} className="snx-icon-button" title="Restart" aria-label="Restart"><RotateCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} /></button>
      <button type="button" onClick={() => onAction('stop')} disabled={isBusy} className="snx-icon-button snx-icon-button--danger" title="Stop" aria-label="Stop"><Square className="h-4 w-4" fill="currentColor" /></button>
    </>
  ) : (
    <button type="button" onClick={() => onAction('start')} disabled={isBusy} className="snx-start-button"><Play className={`h-3.5 w-3.5 ${isBusy ? 'animate-pulse' : ''}`} fill="currentColor" /> Start</button>
  );
};
