import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { PluginProvider, usePlugins } from "./PluginContext";
import { pluginService } from "@/services/pluginService";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/pluginService", () => ({ pluginService: { getActiveMetadata: vi.fn() } }));

const basePlugin = {
  id: 1,
  name: "test",
  verbose_name: "Test",
  description: "",
  version: "1.0",
  routes: [],
  injection_slots: [],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PluginProvider>{children}</PluginProvider>
);

describe("PluginProvider refreshActivePlugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 1 },
      isLoading: false,
    } as any);
  });

  it("loads active plugins when authenticated", async () => {
    vi.mocked(pluginService.getActiveMetadata).mockResolvedValue([basePlugin as any]);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.activePlugins.length).toBe(1));
    expect(result.current.isLoading).toBe(false);
  });

  it("clears plugins and stops loading when not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    } as any);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activePlugins).toEqual([]);
  });

  it("does not clear plugins while auth is still loading", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: true,
    } as any);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    // isLoading stays true while authLoading is true
    expect(result.current.isLoading).toBe(true);
  });

  it("logs warning on 401 error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(pluginService.getActiveMetadata).mockRejectedValue({
      response: { status: 401 },
      message: "Unauthorized",
    } as any);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Authentication required"));
    warnSpy.mockRestore();
  });

  it("logs warning on 403 error", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(pluginService.getActiveMetadata).mockRejectedValue({
      response: { status: 403 },
      message: "Forbidden",
    } as any);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Permission denied"));
    warnSpy.mockRestore();
  });

  it("logs error on unexpected error status", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(pluginService.getActiveMetadata).mockRejectedValue({
      response: { status: 500 },
      message: "Server error",
    } as any);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(errorSpy).toHaveBeenCalledWith(
      "Unexpected error fetching plugin metadata:",
      "Server error"
    );
    errorSpy.mockRestore();
  });

  it("can be manually refreshed", async () => {
    vi.mocked(pluginService.getActiveMetadata).mockResolvedValue([basePlugin as any]);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.activePlugins.length).toBe(1));
    vi.mocked(pluginService.getActiveMetadata).mockResolvedValue([
      basePlugin,
      { ...basePlugin, id: 2, name: "second" },
    ] as any);
    await act(async () => {
      await result.current.refreshActivePlugins();
    });
    await waitFor(() => expect(result.current.activePlugins.length).toBe(2));
  });

  it("getInjectedComponents returns matching slot components", async () => {
    const pluginWithSlot = {
      ...basePlugin,
      injection_slots: [{ slot: "sidebar", component: "SidebarWidget" }],
    };
    vi.mocked(pluginService.getActiveMetadata).mockResolvedValue([pluginWithSlot as any]);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.activePlugins.length).toBe(1));
    const components = result.current.getInjectedComponents("sidebar");
    expect(components).toEqual([{ pluginName: "test", componentName: "SidebarWidget" }]);
  });

  it("getInjectedComponents returns empty array for unmatched slot", async () => {
    const pluginWithSlot = {
      ...basePlugin,
      injection_slots: [{ slot: "sidebar", component: "SidebarWidget" }],
    };
    vi.mocked(pluginService.getActiveMetadata).mockResolvedValue([pluginWithSlot as any]);
    const { result } = renderHook(() => usePlugins(), { wrapper });
    await waitFor(() => expect(result.current.activePlugins.length).toBe(1));
    const components = result.current.getInjectedComponents("header");
    expect(components).toEqual([]);
  });
});
