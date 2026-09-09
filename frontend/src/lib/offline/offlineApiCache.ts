import type { AxiosResponse } from "axios";

const CACHE_PREFIX = "engtracker:offline-api:v1:";
const STALE_MARKER_PREFIX = "engtracker:offline-api-stale:v1:";
const PERSONAL_READ_PATHS = new Set([
  "/overtime/logs/",
  "/standby/logs/",
  "/leave-management/requests/",
]);

type CachedResponse = {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  timestamp: number;
};

function userScope(): string {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return user?.id != null ? String(user.id) : "anonymous";
  } catch {
    return "anonymous";
  }
}

function key(url: string, params?: unknown): string {
  return `${CACHE_PREFIX}${userScope()}:${url}:${JSON.stringify(params || {})}`;
}

function staleMarkerKey(): string {
  return `${STALE_MARKER_PREFIX}${userScope()}`;
}

function isCacheableGet(url?: string): boolean {
  if (!url || userScope() === "anonymous") return false;
  const path = url.split("?", 1)[0].split("#", 1)[0];
  return PERSONAL_READ_PATHS.has(path);
}

export function cacheResponse(response: AxiosResponse): AxiosResponse {
  const url = response.config.url || "";
  if (!isCacheableGet(url)) return response;
  try {
    localStorage.removeItem(staleMarkerKey());
    localStorage.setItem(
      key(url, response.config.params),
      JSON.stringify({
        status: response.status,
        data: response.data,
        headers: { "content-type": "application/json" },
        timestamp: Date.now(),
      } satisfies CachedResponse)
    );
  } catch {
    // Cache is an enhancement; never block a successful API response.
  }
  return response;
}

export function getCachedResponse(config: {
  url?: string;
  params?: unknown;
}): AxiosResponse | null {
  const url = config.url || "";
  if (!isCacheableGet(url)) return null;
  try {
    const raw = localStorage.getItem(key(url, config.params));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedResponse;
    localStorage.setItem(staleMarkerKey(), String(cached.timestamp));
    return {
      data: cached.data,
      status: cached.status,
      statusText: "OK (offline cache)",
      headers: cached.headers,
      config: config as AxiosResponse["config"],
      request: undefined,
    };
  } catch {
    return null;
  }
}

export function hasStaleOfflineData(): boolean {
  // Only the stale marker indicates we are CURRENTLY serving cached
  // fallback data. Mere cache entry existence is the normal state after
  // any successful GET to an allowed path — it does NOT mean the user
  // is seeing stale data right now.
  return localStorage.getItem(staleMarkerKey()) !== null;
}

export function clearOfflineApiCache(): void {
  const prefix = `${CACHE_PREFIX}${userScope()}:`;
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const storageKey = localStorage.key(i);
    if (storageKey?.startsWith(prefix) || storageKey === staleMarkerKey()) {
      localStorage.removeItem(storageKey);
    }
  }
}
