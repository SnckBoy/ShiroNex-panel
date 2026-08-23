# ShiroNex Elevated Dark Glass UI Handoff

## Change summary

The ShiroNex visual layer now uses one restrained, mobile-first **Elevated Dark Glass** system across Dashboard, All Servers, Server Control, and Live Console. The purple/violet identity remains, but the palette is normalized around a cool near-black violet background, frosted surfaces, quiet borders, and a single health visualization: the Pulse Ring.

This is a presentation-only redesign. Existing routes, API endpoints, WebSocket streaming, five-second telemetry polling, command submission, action callbacks, state names, and server-management behavior are preserved.

## Updated layout structures

### Dashboard and All Servers

```tsx
<div className="snx-dashboard-page">
  <div className="snx-dashboard-inner">
    <header className="snx-dashboard-header">
      <div className="snx-page-heading">
        Brand mark + page title + operator subtitle
      </div>
      <div className="snx-dashboard-tools">
        Search input + grid/list switcher
      </div>
    </header>

    <section className="snx-metric-grid">
      <article className="snx-metric-card">
        Metric label + mono value + Pulse Ring + slim sparkline
      </article>
    </section>

    <section className="snx-server-section">
      <div className="snx-section-heading">Runtime inventory + polling state</div>
      <div className="snx-server-grid | snx-server-list">
        <article className="snx-server-card | snx-server-row">
          Status pill + copyable address + Pulse Rings + action shortcuts
        </article>
      </div>
    </section>
  </div>
</div>
```

The same server card now supports both grid and list presentation. Resource values are clamped by `PulseRing`; an abnormal CPU reading cannot overflow the visual track.

### Server Control and Live Console

```tsx
<div className="snx-server-view">
  <aside className="snx-server-sidebar">
    Status card + server navigation + start/stop/restart controls
  </aside>
  <main className="snx-server-main">
    <header className="snx-server-topbar">
      Menu + server title + connection chip + action toolbar
    </header>
    <section className="snx-console-window">
      <header className="snx-console-window-bar">
        Traffic-light controls + System Console + LIVE badge + clear/copy/expand
      </header>
      <div className="snx-console-body">Color-coded streamed log lines</div>
      <div className="snx-quick-command-bar">list / seed / save-all / whitelist / stop</div>
      <form className="snx-command-bar">
        <div className="snx-command-input">admin@node:~$ + raw command input</div>
        <button className="snx-execute-button">Execute</button>
      </form>
    </section>
  </main>
</div>
```

On small screens, `.snx-console-tabs` exposes the Console and Players panes with 44px minimum tap height. Existing terminal drag, resize, float, minimize, wrapping, copy, clear, and font-size interactions remain in place.

## Shared visual primitives

| Primitive | Implementation |
| --- | --- |
| `PulseRing` | `src/components/PulseRing.tsx`; clamps value to 0–100%, maps health to success/warning/danger, exposes ARIA progress semantics, and pulses on a supplied five-second tick key. |
| Glass card | `.snx-metric-card`, `.snx-server-card`, `.snx-console-surface`; 70% surface opacity, 12px blur, subtle border, quiet shadow. |
| Status badge | `.snx-status-pill` plus online, starting, stopping, restarting, and offline tones. |
| Command controls | `.snx-quick-action`, `.snx-quick-command-bar`, `.snx-command-input`, `.snx-execute-button`. |
| Terminal chrome | `.snx-console-window`, `.snx-console-window-bar`, `.qx-window-control`, and the existing live-tail markup. |
| Navigation | `.snx-app-sidebar`, `.snx-global-topbar`, `.snx-server-sidebar`, `.snx-server-topbar`. |

## Token system

The source of truth is `src/styles/shironex-cyberpunk.css`:

```css
--snx-bg: #0B0A14;
--snx-surface: rgba(21, 19, 31, .72);
--snx-border: #29243A;
--snx-primary: #7C6AF0;
--snx-success: #3DDC84;
--snx-warning: #F5A623;
--snx-danger: #F2545B;
```

`data-appearance`, `data-accent`, and `data-theme-preset` continue to map to runtime tokens. Inter is used for UI copy, Chakra Petch for brand/page display text, and JetBrains Mono for IDs, metrics, addresses, and console output.

## Motion and accessibility

The Pulse Ring tick and existing console auto-scroll are the only prominent motion. The stylesheet removes the former ambient/grid animation and disables Pulse Ring/status motion under `prefers-reduced-motion: reduce`. All interactive controls retain visible focus outlines, semantic labels, keyboard access, and touch-safe sizing.

## Validation

The refinement passed TypeScript linting, `git diff --check`, and the production panel/server build. GitHub CI must be rerun after the source batches are published. The existing Vite large-chunk message remains an advisory rather than a build failure.
