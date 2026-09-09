import type { AxiosResponse } from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheResponse,
  clearOfflineApiCache,
  getCachedResponse,
  hasStaleOfflineData,
} from "./offlineApiCache";

describe("offlineApiCache", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("user", JSON.stringify({ id: 42 }));
  });

  it("caches a user-scoped GET response without marking it stale", () => {
    const response = {
      status: 200,
      data: { results: [{ id: 1 }] },
      config: { url: "/overtime/logs/", params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    // A successful fresh response must NOT set the stale marker —
    // having a cache entry is the normal online state, not stale.
    expect(hasStaleOfflineData()).toBe(false);
    expect(getCachedResponse({ url: "/overtime/logs/", params: {} })).not.toBeNull();
  });

  it("marks data as stale only when a cached fallback is actually served", () => {
    const response = {
      status: 200,
      data: { results: [{ id: 1 }] },
      config: { url: "/overtime/logs/", params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    expect(hasStaleOfflineData()).toBe(false);

    // Serving the cached fallback (simulating a network error) sets the stale marker
    getCachedResponse({ url: "/overtime/logs/", params: {} });
    expect(hasStaleOfflineData()).toBe(true);

    // A subsequent fresh response clears the stale marker
    cacheResponse(response);
    expect(hasStaleOfflineData()).toBe(false);
  });

  it("does not cache team endpoints", () => {
    const response = {
      status: 200,
      data: { results: [] },
      config: { url: "/overtime/logs/team_logs/", params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    expect(getCachedResponse({ url: "/overtime/logs/team_logs/", params: {} })).toBeNull();
    expect(hasStaleOfflineData()).toBe(false);
  });

  it.each([
    "/overtime/logs/123/",
    "/overtime/logs/admin_logs/",
    "/overtime/logs/export/",
    "/standby/logs/123/",
    "/standby/logs/admin_logs/",
    "/leave-management/requests/123/",
    "/leave-management/requests/export/",
  ])("does not cache nested or privileged endpoint %s", (url) => {
    const response = {
      status: 200,
      data: { results: [{ id: 1 }] },
      config: { url, params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    expect(getCachedResponse({ url, params: {} })).toBeNull();
  });

  it("does not cache a similarly prefixed endpoint", () => {
    const url = "/overtime/logs-archive/";
    const response = {
      status: 200,
      data: { results: [{ id: 1 }] },
      config: { url, params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    expect(getCachedResponse({ url, params: {} })).toBeNull();
  });

  it("clears both cached responses and stale marker", () => {
    const response = {
      status: 200,
      data: { results: [{ id: 1 }] },
      config: { url: "/leave-management/requests/", params: {} },
    } as AxiosResponse;

    cacheResponse(response);
    getCachedResponse({ url: "/leave-management/requests/", params: {} });
    expect(hasStaleOfflineData()).toBe(true);
    clearOfflineApiCache();
    expect(hasStaleOfflineData()).toBe(false);
    expect(getCachedResponse({ url: "/leave-management/requests/", params: {} })).toBeNull();
  });
});
