import fs from "fs-extra";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

function safeEntryPath(entry: string): boolean {
  const normalized = entry.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return false;
  const parts = normalized.split("/");
  return !parts.some((part) => part === "..") && !/^[A-Za-z]:/.test(normalized);
}

export async function listSafeZipEntries(archivePath: string): Promise<string[]> {
  const stat = await fs.stat(archivePath);
  if (stat.size <= 0 || stat.size > MAX_ARCHIVE_BYTES) throw new Error("Archive is empty or exceeds the 2 GB safety limit");
  const { stdout } = await execFileAsync("unzip", ["-Z1", archivePath], { maxBuffer: 4 * 1024 * 1024 });
  const entries = stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (entries.length > MAX_ENTRIES) throw new Error("Archive contains too many entries");
  if (entries.some((entry) => !safeEntryPath(entry))) throw new Error("Archive contains an unsafe extraction path");
  return entries;
}

export async function extractZipSafely(archivePath: string, destination: string): Promise<string[]> {
  const entries = await listSafeZipEntries(archivePath);
  await fs.ensureDir(destination);
  await execFileAsync("unzip", ["-q", "-o", archivePath, "-d", destination], { maxBuffer: 2 * 1024 * 1024 });
  for (const entry of entries) {
    const resolved = path.resolve(destination, entry);
    if (resolved !== path.resolve(destination) && !resolved.startsWith(`${path.resolve(destination)}${path.sep}`)) {
      throw new Error("Archive extraction escaped its destination");
    }
  }
  return entries;
}

export async function copyDirectorySafely(source: string, destination: string): Promise<void> {
  const resolvedSource = path.resolve(source);
  const resolvedDestination = path.resolve(destination);
  await fs.ensureDir(resolvedDestination);
  const entries = await fs.readdir(resolvedSource, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("Symbolic links are not allowed in imported archives");
    const from = path.join(resolvedSource, entry.name);
    const to = path.join(resolvedDestination, entry.name);
    if (entry.isDirectory()) await copyDirectorySafely(from, to);
    else if (entry.isFile()) await fs.copyFile(from, to);
  }
}
