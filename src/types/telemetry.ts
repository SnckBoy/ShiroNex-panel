export type TelemetryStatus = "live" | "stale" | "unavailable";

export interface TelemetryMetric {
  usedBytes: number | null;
  limitBytes: number | null;
  usagePercent: number | null;
  visualPercent: number | null;
}

export interface TelemetrySnapshot {
  timestamp: number | null;
  status: TelemetryStatus;
  cpu: {
    usagePercent: number | null;
    capacityPercent: number | null;
    visualPercent: number | null;
  };
  memory: TelemetryMetric;
  disk: TelemetryMetric;
  network: {
    downloadBytesPerSecond: number | null;
    uploadBytesPerSecond: number | null;
    downloadTotalBytes: number | null;
    uploadTotalBytes: number | null;
  };
  tps: number | null;
  mspt: number | null;
}

export const EMPTY_TELEMETRY: TelemetrySnapshot = {
  timestamp: null,
  status: "unavailable",
  cpu: { usagePercent: null, capacityPercent: null, visualPercent: null },
  memory: { usedBytes: null, limitBytes: null, usagePercent: null, visualPercent: null },
  disk: { usedBytes: null, limitBytes: null, usagePercent: null, visualPercent: null },
  network: {
    downloadBytesPerSecond: null,
    uploadBytesPerSecond: null,
    downloadTotalBytes: null,
    uploadTotalBytes: null,
  },
  tps: null,
  mspt: null,
};
