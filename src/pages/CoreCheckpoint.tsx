import InfrastructureCore, { type CoreServer } from "../components/InfrastructureCore";

const demoServers: CoreServer[] = [
  { id: "core-alpha", name: "Alpha Node", status: "online", load: 38 },
  { id: "core-beta", name: "Beta Node", status: "warning", load: 76 },
  { id: "core-gamma", name: "Gamma Node", status: "online", load: 54 },
  { id: "core-delta", name: "Delta Node", status: "offline", load: 3 },
  { id: "core-epsilon", name: "Epsilon Node", status: "online", load: 21 },
];

export default function CoreCheckpoint() {
  return (
    <main className="snx-core-checkpoint">
      <div className="snx-core-checkpoint__backdrop" aria-hidden="true" />
      <header className="snx-core-checkpoint__intro">
        <span className="snx-eyebrow">SHIRONEX / VISUAL CHECKPOINT 01</span>
        <h1>Infrastructure Core</h1>
        <p>A single physical visualization for fleet health. Drag the cluster on desktop or touch it on mobile.</p>
      </header>
      <InfrastructureCore servers={demoServers} size="hero" />
      <section className="snx-core-checkpoint__notes" aria-label="Checkpoint notes">
        <div><strong>24</strong><span>maximum rendered blocks</span></div>
        <div><strong>1.25s</strong><span>boot assembly sequence</span></div>
        <div><strong>2D</strong><span>reduced-motion safe mode</span></div>
        <div><strong>PAUSED</strong><span>when the browser tab is hidden</span></div>
      </section>
    </main>
  );
}
