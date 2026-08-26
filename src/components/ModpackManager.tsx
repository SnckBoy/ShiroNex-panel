import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FileArchive,
  Info,
  Loader2,
  PackageOpen,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

type Provider = "modrinth";

type MarketplaceItem = {
  id: string;
  provider: Provider;
  kind: "modpack";
  name: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  rating: number | null;
  latestVersion: string | null;
  gameVersions: string[];
  loaders: string[];
  platforms: string[];
  updatedAt: string | null;
  projectUrl: string;
  compatibility: "known" | "unknown";
};

export default function ModpackManager({ serverId }: { serverId: string }) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [query, setQuery] = useState("");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchModpacks = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await axios.get<{ items: MarketplaceItem[] }>("/api/marketplace/search", {
        params: {
          q: query.trim(),
          kind: "modpack",
          provider: "modrinth",
          gameVersion: gameVersion.trim() || undefined,
          loader: loader.trim() || undefined,
          limit: 24,
        },
      });
      setItems(response.data.items || []);
    } catch (requestError: any) {
      setItems([]);
      setError(requestError.response?.data?.error || "The modpack provider is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void searchModpacks(), 350);
    return () => window.clearTimeout(timer);
  }, [query, gameVersion, loader]);

  const visibleItems = useMemo(() => [...items].sort((a, b) => b.downloads - a.downloads), [items]);

  const installRemote = async (item: MarketplaceItem, confirmReplace = false): Promise<boolean> => {
    try {
      await axios.post(`/api/servers/${serverId}/modpacks/install`, {
        provider: item.provider,
        projectId: item.id,
        projectName: item.name,
        gameVersion: gameVersion.trim() || undefined,
        loader: loader.trim() || undefined,
        confirmReplace,
      });
      setNotice(`${item.name} was validated and imported. Review the files before starting the server.`);
      return true;
    } catch (requestError: any) {
      if (requestError.response?.status === 409 && requestError.response?.data?.requiresConfirmation && !confirmReplace) {
        const shouldReplace = window.confirm(
          `${item.name} will replace files in this server. ShiroNex will create a pre-import backup first. Continue?`,
        );
        return shouldReplace ? installRemote(item, true) : false;
      }
      setError(requestError.response?.data?.error || "Modpack installation failed.");
      return false;
    }
  };

  const handleInstall = async (item: MarketplaceItem) => {
    if (!window.confirm(`Import ${item.name} into this server? Existing files are backed up before replacement.`)) return;
    setWorking(item.id);
    setError("");
    setNotice("");
    await installRemote(item);
    setWorking(null);
  };

  const uploadModpack = async (file: File, confirmReplace = false): Promise<boolean> => {
    const form = new FormData();
    form.append("archive", file);
    form.append("confirmReplace", String(confirmReplace));
    try {
      await axios.post(`/api/servers/${serverId}/modpacks/import`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotice(`${file.name} was validated and imported. Review the files before starting the server.`);
      return true;
    } catch (requestError: any) {
      if (requestError.response?.status === 409 && requestError.response?.data?.requiresConfirmation && !confirmReplace) {
        const shouldReplace = window.confirm(
          "This server already contains files. ShiroNex will create a pre-import backup before replacing them. Continue?",
        );
        return shouldReplace ? uploadModpack(file, true) : false;
      }
      setError(requestError.response?.data?.error || "Archive import failed.");
      return false;
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(zip|mrpack)$/i.test(file.name)) {
      setError("Choose a .zip or .mrpack archive.");
      return;
    }
    setWorking("upload");
    setError("");
    setNotice("");
    await uploadModpack(file);
    setWorking(null);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent p-4 text-foreground md:p-8">
      <div className="mx-auto max-w-6xl space-y-5 md:space-y-7">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/80"><PackageOpen className="h-4 w-4" /> Marketplace</div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground md:text-3xl">Modpack Marketplace</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Discover curated Modrinth packs or import your own archive. Every replacement is gated by confirmation and protected with a pre-import backup.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1.5 text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> Safe archive checks</span>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full bg-violet-400 px-3.5 py-1.5 font-bold text-slate-950 transition hover:bg-violet-300"><Upload className="h-3.5 w-3.5" /> Import archive</button>
            <input ref={fileInputRef} type="file" accept=".zip,.mrpack" className="hidden" onChange={handleFile} />
          </div>
        </header>

        <section className="snx-console-surface rounded-2xl border border-border-subtle p-4 md:p-5">
          <form onSubmit={searchModpacks} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block"><span className="sr-only">Search modpacks</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modpacks by name or theme" className="w-full rounded-xl border border-border bg-muted-subtle py-3 pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10" /></label>
            <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-violet-300 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search</button>
          </form>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground"><span className="mb-1.5 block">Minecraft version</span><input value={gameVersion} onChange={(event) => setGameVersion(event.target.value)} placeholder="e.g. 1.21.1" className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none" /></label>
            <label className="text-xs text-muted-foreground"><span className="mb-1.5 block">Loader</span><input value={loader} onChange={(event) => setLoader(event.target.value)} placeholder="Fabric, Forge, NeoForge" className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none" /></label>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-xs leading-5 text-cyan-100/80"><Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />Remote imports are restricted to provider-approved archive URLs. Server files are never overwritten silently.</div>
        </section>

        {error && <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</div>}
        {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-200"><CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}</div>}
        {!loading && !error && visibleItems.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground"><FileArchive className="mx-auto mb-3 h-7 w-7" /><p>No modpacks found for this search.</p><p className="mt-1 text-xs">Try a broader term or import a .zip/.mrpack archive.</p></div>}

        <div className="grid gap-4 xl:grid-cols-2">
          {visibleItems.map((item) => (
            <article key={`${item.provider}-${item.id}`} className="snx-console-surface group flex min-w-0 flex-col gap-4 rounded-2xl border border-border-subtle p-4 transition hover:border-violet-400/30 md:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted text-violet-300">{item.iconUrl ? <img src={item.iconUrl} alt="" className="h-full w-full object-cover" /> : <Archive className="h-6 w-6" />}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-bold text-foreground">{item.name}</h3><span className="rounded-full border border-violet-400/20 bg-violet-400/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">Modrinth</span></div><p className="mt-1 text-xs text-muted-foreground">by {item.author}</p></div>
                <a href={item.projectUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Open ${item.name} source page`}><ExternalLink className="h-4 w-4" /></a>
              </div>
              <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{item.description || "No description provided by the provider."}</p>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> {item.downloads.toLocaleString()}</span>{item.gameVersions.slice(0, 3).map((version) => <span key={version} className="rounded-md bg-muted px-2 py-0.5">{version}</span>)}{item.loaders.slice(0, 2).map((value) => <span key={value} className="rounded-md bg-muted px-2 py-0.5">{value}</span>)}<span className={item.compatibility === "known" ? "text-emerald-300" : "text-amber-300"}>{item.compatibility === "known" ? "Compatibility data available" : "Compatibility to verify"}</span></div>
              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Archive className="h-3.5 w-3.5" /> Backup before replace</span><button type="button" onClick={() => void handleInstall(item)} disabled={working !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-violet-400/30 bg-violet-400/10 px-4 text-sm font-semibold text-violet-200 transition hover:bg-violet-400/20 disabled:cursor-wait disabled:opacity-50">{working === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {working === item.id ? "Importing" : "One-click import"}</button></div>
            </article>
          ))}
        </div>
      </div>
      {working !== null && <LoadingOverlay message={working === "upload" ? "Validating and importing archive..." : "Downloading and importing modpack..."} />}
    </div>
  );
}

// Keep the provider type intentionally narrow until additional official modpack download APIs are implemented.
void ("modrinth" as Provider);
