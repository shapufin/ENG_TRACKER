import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useReportArchive } from "./useReportArchive";
import api from "@/lib/api";

const state = vi.hoisted(() => ({
  plugins: [] as { name: string }[],
  perms: { exp: false, man: false },
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ activePlugins: state.plugins }),
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({
    canExport: () => state.perms.exp,
    canManage: () => state.perms.man,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("useReportArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } });
    state.plugins = [];
    state.perms = { exp: false, man: false };
  });

  it("makes no request and is disabled when the plugin is inactive", () => {
    state.perms = { exp: true, man: true };
    const { result } = renderHook(() => useReportArchive(), { wrapper });
    expect(result.current.enabled).toBe(false);
    expect(api.get).not.toHaveBeenCalled();
  });

  it("with export only runs the exports query", async () => {
    state.plugins = [{ name: "analytics" }];
    state.perms = { exp: true, man: false };
    const { result } = renderHook(() => useReportArchive(), { wrapper });
    expect(result.current.enabled).toBe(true);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    expect(api.get).toHaveBeenCalledWith("plugins/analytics/metrics/export-jobs/");
    expect(result.current.schedules.enabled).toBe(false);
  });

  it("with manage runs both queries", async () => {
    state.plugins = [{ name: "analytics" }];
    state.perms = { exp: true, man: true };
    renderHook(() => useReportArchive(), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenCalledWith("plugins/analytics/scheduled-reports/");
  });
});
