import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePluginManagement } from "./usePluginManagement";
import { pluginService } from "@/services/pluginService";
import type { PluginRecord } from "@/services/pluginService";

const mockRefresh = vi.fn();

const plugin = (overrides: Partial<PluginRecord> = {}): PluginRecord => ({
  id: 1,
  name: "analytics",
  verbose_name: "Analytics",
  description: "",
  version: "1",
  config: {},
  is_enabled: true,
  created_at: "",
  updated_at: "",
  ...overrides,
});

vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ refreshActivePlugins: mockRefresh }),
}));

vi.mock("@/services/pluginService", () => ({
  pluginService: {
    getPlugins: vi.fn(),
    togglePlugin: vi.fn(),
    initializePlugin: vi.fn(),
    discoverPlugins: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("usePluginManagement", () => {
  it("fetches plugins on mount", async () => {
    vi.mocked(pluginService.getPlugins).mockResolvedValue([plugin()]);
    const { result } = renderHook(() => usePluginManagement());
    await waitFor(() => expect(result.current.plugins.length).toBe(1));
    expect(result.current.plugins[0].name).toBe("analytics");
  });

  it("handles toggle", async () => {
    vi.mocked(pluginService.getPlugins).mockResolvedValue([plugin({ is_enabled: false })]);
    vi.mocked(pluginService.togglePlugin).mockResolvedValue({ is_enabled: true } as any);
    const { result } = renderHook(() => usePluginManagement());
    await waitFor(() => expect(result.current.plugins.length).toBe(1));
    await act(async () => result.current.handleToggle(1));
    expect(pluginService.togglePlugin).toHaveBeenCalledWith(1);
  });

  it("handles initialize success", async () => {
    vi.mocked(pluginService.getPlugins).mockResolvedValue([]);
    vi.mocked(pluginService.initializePlugin).mockResolvedValue({
      status: "ok",
      message: "Initialized",
    });
    const { result } = renderHook(() => usePluginManagement());
    await act(async () => result.current.handleInitialize(1));
    expect(pluginService.initializePlugin).toHaveBeenCalledWith(1);
    expect(result.current.initializingId).toBeNull();
  });

  it("handles initialize error", async () => {
    vi.mocked(pluginService.getPlugins).mockResolvedValue([]);
    vi.mocked(pluginService.initializePlugin).mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => usePluginManagement());
    await act(async () => result.current.handleInitialize(1));
    expect(result.current.initializingId).toBeNull();
  });

  it("handles plugin link with known route", async () => {
    const originalHref = window.location.href;
    Object.defineProperty(window, "location", { value: { href: originalHref }, writable: true });
    vi.mocked(pluginService.getPlugins).mockResolvedValue([]);
    const { result } = renderHook(() => usePluginManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.handlePluginLink({ id: 1, name: "analytics" } as any));
    expect(window.location.href).toBe("/admin/analytics");
  });

  it("handles plugin link with unknown route", async () => {
    vi.mocked(pluginService.getPlugins).mockResolvedValue([]);
    const { result } = renderHook(() => usePluginManagement());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.handlePluginLink({ id: 1, name: "unknown" } as any));
    expect(result.current.selectedPlugin).toBeNull();
  });
});
