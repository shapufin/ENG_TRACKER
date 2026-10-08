import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { usePluginPermissions } from "./usePluginPermissions";
import { pluginService } from "@/services/pluginService";
import { useAuth } from "@/context/AuthContext";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/services/pluginService", () => ({
  pluginService: { getUserPermissions: vi.fn() },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("usePluginPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    focusManager.setFocused(undefined);
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true, user: { id: 1 } } as any);
  });

  it("exposes hasPermission/canView derived from fetched permissions", async () => {
    vi.mocked(pluginService.getUserPermissions).mockResolvedValue([
      {
        plugin_name: "engagement",
        verbose_name: "Engagement",
        permissions: ["view"],
        has_access: true,
      },
    ]);
    const { result } = renderHook(() => usePluginPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canView("engagement")).toBe(true);
    expect(result.current.canManage("engagement")).toBe(false);
  });

  it("refetches on window focus, so a permission grant/revoke shows up without a manual reload", async () => {
    vi.mocked(pluginService.getUserPermissions).mockResolvedValue([]);
    const { result } = renderHook(() => usePluginPermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(pluginService.getUserPermissions).mockResolvedValue([
      {
        plugin_name: "tl_scorecard",
        verbose_name: "TL Scorecard",
        permissions: ["view"],
        has_access: true,
      },
    ]);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(result.current.canView("tl_scorecard")).toBe(true));
  });
});
