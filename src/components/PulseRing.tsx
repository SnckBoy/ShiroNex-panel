import React, { useMemo } from 'react';

export interface PulseRingProps {
  value: number | null;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  status?: 'live' | 'stale' | 'unavailable';
}

export function PulseRing({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  showValue = true,
  label,
  icon,
  className = '',
  status = value === null ? 'unavailable' : 'live',
}: PulseRingProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const ratio = safeValue === null ? 0 : Math.min(1, Math.max(0, safeValue / safeMax));
  const percent = safeValue === null ? null : Math.round(ratio * 100);
  const tone = status === 'unavailable' ? 'muted' : (percent ?? 0) >= 80 ? 'danger' : (percent ?? 0) >= 60 ? 'warning' : 'success';
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const viewBox = 44;
  const readableValue = useMemo(() => percent === null ? '—' : `${percent}%`, [percent]);

  return (
    <div
      className={`snx-pulse-ring snx-pulse-ring--${tone} snx-pulse-ring--${status} ${className}`}
      style={{ ['--snx-ring-size' as string]: `${size}px` }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-busy={status === 'live' ? undefined : true}
    >
      <svg className="snx-pulse-ring__svg" viewBox={`0 0 ${viewBox} ${viewBox}`} aria-hidden="true">
        <circle className="snx-pulse-ring__track" cx="22" cy="22" r={radius} fill="none" strokeWidth={strokeWidth} />
        <circle
          className="snx-pulse-ring__progress"
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 22 22)"
        />
      </svg>
      <span className="snx-pulse-ring__center">
        {icon || (showValue ? <strong>{readableValue}</strong> : null)}
      </span>
    </div>
  );
}

export default PulseRing;
