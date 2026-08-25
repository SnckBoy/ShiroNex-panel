import { EMPTY_TELEMETRY, TelemetrySnapshot } from "../types/telemetry";

export const finiteNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const clampPercent = (value: number | null) => value === null ? null : Math.max(0, Math.min(100, value));

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const bytesFromMegabytes = (value: unknown) => {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.max(0, parsed * 1024 * 1024);
};

const bytesFromGigabytes = (value: unknown) => {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.max(0, parsed * 1024 * 1024 * 1024);
};

export function normalizeTelemetry(payload: any, previous: TelemetrySnapshot = EMPTY_TELEMETRY, now = Date.now()): TelemetrySnapshot {
  const source = payload && typeof payload === "object" ? payload : {};
  const memory = source.memory && typeof source.memory === "object" ? source.memory : {};
  const network = source.network && typeof source.network === "object" ? source.network : {};
  const telemetry = source.telemetry && typeof source.telemetry === "object" ? source.telemetry : {};

  const cpuUsage = firstNumber(source.cpu, source.cpuUsage, telemetry.cpu?.usagePercent);
  const cpuCapacity = firstNumber(source.limitCpu, source.cpuCapacity, telemetry.cpu?.capacityPercent);
  const usedMemory = firstNumber(source.memoryUsedBytes, memory.usedBytes, source.ramBytes, source.ram) ?? null;
  const normalizedUsedMemory = source.memoryUsedBytes !== undefined || memory.usedBytes !== undefined || source.ramBytes !== undefined
    ? usedMemory
    : bytesFromMegabytes(usedMemory);
  const memoryLimit = firstNumber(source.limitRamBytes, memory.limitBytes, source.ramLimitBytes) ?? bytesFromMegabytes(source.limitRam);
  const usedDisk = firstNumber(source.diskUsedBytes, source.disk?.usedBytes) ?? bytesFromGigabytes(source.disk);
  const diskLimit = firstNumber(source.limitDiskBytes, source.disk?.limitBytes) ?? bytesFromGigabytes(source.limitDisk);
  const rxTotal = firstNumber(source.networkRxBytes, network.rxBytes, source.downloadTotalBytes, telemetry.network?.downloadTotalBytes);
  const txTotal = firstNumber(source.networkTxBytes, network.txBytes, source.uploadTotalBytes, telemetry.network?.uploadTotalBytes);
  const previousAt = previous.timestamp ?? now;
  const elapsed = Math.max((now - previousAt) / 1000, 0.1);
  const previousRx = previous.network.downloadTotalBytes;
  const previousTx = previous.network.uploadTotalBytes;
  const rxRate = rxTotal !== null && previousRx !== null && rxTotal >= previousRx ? (rxTotal - previousRx) / elapsed : firstNumber(source.networkRxBytesPerSecond, network.downloadBytesPerSecond, network.rxBytesPerSecond);
  const txRate = txTotal !== null && previousTx !== null && txTotal >= previousTx ? (txTotal - previousTx) / elapsed : firstNumber(source.networkTxBytesPerSecond, network.uploadBytesPerSecond, network.txBytesPerSecond);
  const timestamp = firstNumber(source.timestamp, source.timestampMs, telemetry.timestamp) ?? now;
  const ageMs = Math.max(0, now - (timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp));
  const hasMetric = cpuUsage !== null || normalizedUsedMemory !== null || usedDisk !== null || rxTotal !== null || txTotal !== null || firstNumber(source.tps, telemetry.tps) !== null || firstNumber(source.mspt, telemetry.mspt) !== null;
  const status = source.error || source.available === false || !hasMetric ? "unavailable" : ageMs > 15_000 ? "stale" : "live";
  const memoryUsage = normalizedUsedMemory !== null && memoryLimit !== null && memoryLimit > 0 ? (normalizedUsedMemory / memoryLimit) * 100 : null;
  const diskUsage = usedDisk !== null && diskLimit !== null && diskLimit > 0 ? (usedDisk / diskLimit) * 100 : null;

  return {
    timestamp: timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp,
    status,
    cpu: {
      usagePercent: cpuUsage,
      capacityPercent: cpuCapacity,
      visualPercent: cpuUsage === null ? null : clampPercent(cpuCapacity !== null && cpuCapacity > 0 ? (cpuUsage / cpuCapacity) * 100 : cpuUsage),
    },
    memory: { usedBytes: normalizedUsedMemory, limitBytes: memoryLimit, usagePercent: memoryUsage, visualPercent: clampPercent(memoryUsage) },
    disk: { usedBytes: usedDisk, limitBytes: diskLimit, usagePercent: diskUsage, visualPercent: clampPercent(diskUsage) },
    network: { downloadBytesPerSecond: rxRate, uploadBytesPerSecond: txRate, downloadTotalBytes: rxTotal, uploadTotalBytes: txTotal },
    tps: firstNumber(source.tps, telemetry.tps),
    mspt: firstNumber(source.mspt, telemetry.mspt),
  };
}

export const formatBytes = (bytes: number | null, empty = "--") => {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return empty;
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = -1;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

export const formatPercent = (value: number | null, empty = "--") => value === null || !Number.isFinite(value) ? empty : `${value.toFixed(1)}%`;
export const formatCpu = (value: number | null, empty = "--") => value === null || !Number.isFinite(value) ? empty : `${value.toFixed(1)}%`;
export const formatNetworkRate = (value: number | null, empty = "--") => formatBytes(value, empty) + (value === null ? "" : "/s");
