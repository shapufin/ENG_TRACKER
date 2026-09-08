import { describe, it, expect } from "vitest";
import { fetchActivePlugins } from "./pluginContextHelpers";
import type { PluginMetadata } from "@/services/pluginService";

const basePlugin: PluginMetadata = {
  id: 1,
  name: "test-plugin",
  verbose_name: "Test Plugin",
  description: "A test plugin",
  version: "1.0.0",
  routes: [],
  injection_slots: [],
} as PluginMetadata;

describe("fetchActivePlugins", () => {
  it("returns empty plugins when not authenticated", async () => {
    const result = await fetchActivePlugins({
      isAuthenticated: false,
      user: { id: 1 },
      authLoading: false,
      getActiveMetadata: async () => [basePlugin],
    });
    expect(result.plugins).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it("returns empty plugins when user is null", async () => {
    const result = await fetchActivePlugins({
      isAuthenticated: true,
      user: null,
      authLoading: false,
      getActiveMetadata: async () => [basePlugin],
    });
    expect(result.plugins).toEqual([]);
  });

  it("returns empty plugins when auth is loading", async () => {
    const result = await fetchActivePlugins({
      isAuthenticated: true,
      user: { id: 1 },
      authLoading: true,
      getActiveMetadata: async () => [basePlugin],
    });
    expect(result.plugins).toEqual([]);
  });

  it("fetches and returns active plugins", async () => {
    const result = await fetchActivePlugins({
      isAuthenticated: true,
      user: { id: 1 },
      authLoading: false,
      getActiveMetadata: async () => [basePlugin],
    });
    expect(result.plugins).toEqual([basePlugin]);
  });

  it("returns empty plugins and error when fetch fails", async () => {
    const error = new Error("network error");
    const result = await fetchActivePlugins({
      isAuthenticated: true,
      user: { id: 1 },
      authLoading: false,
      getActiveMetadata: async () => {
        throw error;
      },
    });
    expect(result.plugins).toEqual([]);
    expect(result.error).toBe(error);
  });
});
