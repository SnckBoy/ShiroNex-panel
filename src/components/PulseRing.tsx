import React, { useMemo } from 'react';

export interface PulseRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
  pulseKey?: string | number;
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
  pulseKey,
}: PulseRingProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? value : 0;
  const ratio = Math.min(1, Math.max(0, safeValue / safeMax));
  const percent = Math.round(ratio * 100);
  const tone = percent >= 80 ? 'danger' : percent >= 60 ? 'warning' : 'success';
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);
  const viewBox = 44;
  const tickKey = pulseKey ?? `${Math.round(safeValue * 100)}-${Math.round(safeMax * 100)}`;
  const readableValue = useMemo(() => `${percent}%`, [percent]);

  return (
    <div
      className={`snx-pulse-ring snx-pulse-ring--${tone} ${className}`}
      style={{ ['--snx-ring-size' as string]: `${size}px` }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg className="snx-pulse-ring__svg" viewBox={`0 0 ${viewBox} ${viewBox}`} aria-hidden="true">
        <circle className="snx-pulse-ring__track" cx="22" cy="22" r={radius} fill="none" strokeWidth={strokeWidth} />
        <circle
          key={tickKey}
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
