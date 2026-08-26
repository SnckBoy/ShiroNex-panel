import axios, { AxiosInstance } from "axios";

export type MarketplaceKind = "plugin" | "mod" | "modpack";
export type MarketplaceProvider = "modrinth" | "hangar" | "spiget";

export interface MarketplaceQuery {
  query: string;
  kind: MarketplaceKind;
  provider?: MarketplaceProvider | "all";
  gameVersion?: string;
  loader?: string;
  limit?: number;
}

export interface MarketplaceItem {
  id: string;
  provider: MarketplaceProvider;
  kind: MarketplaceKind;
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
}

const http: AxiosInstance = axios.create({
  timeout: 12_000,
  headers: { "User-Agent": "ShiroNex-Panel/1.0 marketplace" },
});

const cache = new Map<string, { expiresAt: number; value: MarketplaceItem[] }>();
const CACHE_TTL_MS = 60_000;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeModrinth(hit: any, kind: MarketplaceKind): MarketplaceItem {
  return {
    id: cleanText(hit.project_id),
    provider: "modrinth",
    kind,
    name: cleanText(hit.title) || "Unnamed project",
    description: cleanText(hit.description),
    author: cleanText(hit.author) || "Unknown author",
    iconUrl: cleanText(hit.icon_url) || null,
    downloads: Number(hit.downloads) || 0,
    rating: null,
    latestVersion: cleanText(hit.latest_version) || null,
    gameVersions: asStringArray(hit.versions),
    loaders: asStringArray(hit.categories),
    platforms: asStringArray(hit.environment),
    updatedAt: cleanText(hit.date_modified) || null,
    projectUrl: `https://modrinth.com/${kind === "modpack" ? "modpack" : kind}/${encodeURIComponent(cleanText(hit.slug) || cleanText(hit.project_id))}`,
    compatibility: asStringArray(hit.versions).length > 0 ? "known" : "unknown",
  };
}

async function searchModrinth(query: MarketplaceQuery): Promise<MarketplaceItem[]> {
  const projectType = query.kind === "plugin" ? "plugin" : query.kind === "modpack" ? "modpack" : "mod";
  const facets: string[][] = [[`project_type:${projectType}`]];
  if (query.loader) facets.push([`categories:${query.loader.toLowerCase()}`]);
  if (query.gameVersion) facets.push([`versions:${query.gameVersion}`]);
  const response = await http.get("https://api.modrinth.com/v2/search", {
    params: { query: query.query || undefined, facets: JSON.stringify(facets), limit: clampLimit(query.limit) },
  });
  if (!Array.isArray(response.data?.hits)) return [];
  return response.data.hits
    .filter((hit: any) => {
      const primary = cleanText(hit.project_type);
      const allTypes = asStringArray(hit.all_project_types);
      return primary === projectType || allTypes.includes(projectType);
    })
    .map((hit: any) => normalizeModrinth(hit, query.kind));
}

async function searchHangar(query: MarketplaceQuery): Promise<MarketplaceItem[]> {
  if (query.kind !== "plugin" && query.kind !== "mod") return [];
  const response = await http.get("https://hangar.papermc.io/api/v1/projects", {
    params: { q: query.query || undefined, limit: clampLimit(query.limit) },
  });
  const rows = Array.isArray(response.data?.result) ? response.data.result : [];
  return rows.map((hit: any): MarketplaceItem => {
    const owner = cleanText(hit.namespace?.owner);
    const slug = cleanText(hit.namespace?.slug);
    const downloads = Number(hit.stats?.downloads) || 0;
    return {
      id: owner && slug ? `${owner}/${slug}` : slug || owner,
      provider: "hangar",
      kind: "plugin",
      name: cleanText(hit.name) || slug || "Unnamed project",
      description: cleanText(hit.description),
      author: owner || "Unknown author",
      iconUrl: cleanText(hit.avatar) || null,
      downloads,
      rating: null,
      latestVersion: null,
      gameVersions: [],
      loaders: [],
      platforms: ["Paper", "Spigot", "Purpur"].filter((platform) => cleanText(hit.category) === "PLUGIN" || platform === "Paper"),
      updatedAt: cleanText(hit.lastUpdated) || null,
      projectUrl: owner && slug ? `https://hangar.papermc.io/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}` : "https://hangar.papermc.io/",
      compatibility: "unknown",
    };
  });
}

async function searchSpiget(query: MarketplaceQuery): Promise<MarketplaceItem[]> {
  if (query.kind !== "plugin") return [];
  const response = await http.get(`https://api.spiget.org/v2/search/resources/${encodeURIComponent(query.query || "")}`, {
    params: { field: "name", size: clampLimit(query.limit), page: 1 },
  });
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.map((hit: any): MarketplaceItem => ({
    id: String(hit.id),
    provider: "spiget",
    kind: "plugin",
    name: cleanText(hit.name) || "Unnamed resource",
    description: cleanText(hit.tag),
    author: cleanText(hit.author?.name) || "Unknown author",
    iconUrl: cleanText(hit.icon?.url) ? `https://spigotmc.org/${hit.icon.url}` : null,
    downloads: Number(hit.downloads) || 0,
    rating: Number(hit.rating?.average) || null,
    latestVersion: cleanText(hit.version) || null,
    gameVersions: [],
    loaders: [],
    platforms: ["Spigot"],
    updatedAt: hit.updateDate ? new Date(Number(hit.updateDate) * 1000).toISOString() : null,
    projectUrl: `https://www.spigotmc.org/resources/${encodeURIComponent(String(hit.id))}/`,
    compatibility: "unknown",
  }));
}

export async function searchMarketplace(query: MarketplaceQuery): Promise<MarketplaceItem[]> {
  const normalized: MarketplaceQuery = { ...query, query: cleanText(query.query), limit: clampLimit(query.limit) };
  const cacheKey = JSON.stringify(normalized);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const providers = normalized.provider && normalized.provider !== "all" ? [normalized.provider] : ["modrinth", "hangar", "spiget"];
  const results = await Promise.allSettled(providers.map((provider) => {
    if (provider === "modrinth") return searchModrinth(normalized);
    if (provider === "hangar") return searchHangar(normalized);
    return searchSpiget(normalized);
  }));
  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  items.sort((left, right) => right.downloads - left.downloads || left.name.localeCompare(right.name));
  const value = items.slice(0, normalized.limit!);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
