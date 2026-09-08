import React from "react";
import { Activity, ArrowUpRight, Cpu, Database, LockKeyhole, Server, ShieldCheck, Sparkles } from "lucide-react";

interface AuthExperienceProps {
  panelName: string;
  panelLogo?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  mode?: "auth" | "setup";
}

export default function AuthExperience({ panelName, panelLogo, eyebrow, title, description, children, footer, mode = "auth" }: AuthExperienceProps) {
  return (
    <main className="auth-experience" data-mode={mode}>
      <div className="auth-experience__backdrop" aria-hidden="true"><span /><span /><span /></div>
      <div className="auth-experience__grid">
        <section className="auth-experience__story" aria-label={`${panelName} overview`}>
          <div className="auth-brand-lockup">
            <div className="auth-brand-mark">{panelLogo ? <img src={panelLogo} alt="" /> : <Server size={22} />}</div>
            <div><strong>{panelName}</strong><span>Infrastructure control plane</span></div>
          </div>
          <div className="auth-story-copy">
            <span className="auth-kicker"><span className="auth-kicker__dot" /> {mode === "setup" ? "Protected first-run" : "Operator workspace"}</span>
            <h1>Run every server with <em>clarity.</em></h1>
            <p>One calm command center for Minecraft servers, nodes, backups, and the people who keep them online.</p>
          </div>
          <div className="auth-telemetry" aria-label="Platform capabilities">
            <div><Activity size={16} /><span><b>Live telemetry</b><small>Fleet health in one view</small></span></div>
            <div><ShieldCheck size={16} /><span><b>Secure by default</b><small>Roles and access controls</small></span></div>
            <div><Cpu size={16} /><span><b>Node-native</b><small>Built around your runtime</small></span></div>
          </div>
          <div className="auth-story-footer"><span className="auth-live-dot" /> Platform status <strong>Operational</strong><ArrowUpRight size={14} /></div>
        </section>
        <section className="auth-experience__panel" aria-labelledby="auth-title">
          <div className="auth-panel-topline"><span>{eyebrow}</span><span className="auth-panel-secure"><LockKeyhole size={13} /> Encrypted session</span></div>
          <div className="auth-panel-heading"><div className="auth-mobile-mark">{panelLogo ? <img src={panelLogo} alt="" /> : <Server size={20} />}</div><span className="auth-panel-kicker">{eyebrow}</span><h2 id="auth-title">{title}</h2><p>{description}</p></div>
          <div className="auth-panel-content">{children}</div>
          {footer && <div className="auth-panel-footer">{footer}</div>}
          <div className="auth-panel-meta"><Sparkles size={13} /> {mode === "setup" ? "The first account receives Owner access." : "Your access is protected by secure authentication."}</div>
        </section>
      </div>
      <div className="auth-experience__footnote"><Database size={13} /> SNCK CONTROL PLANE <span>•</span> Built for reliable operations</div>
    </main>
  );
}
