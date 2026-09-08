import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePluginConfigDialog } from "./usePluginConfigDialog";
import api from "@/lib/api";
import { permissionService } from "@/services/permissionService";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  __esModule: true,
}));

vi.mock("@/services/permissionService", () => ({
  permissionService: { getRoles: vi.fn(), getAllGroups: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/context/PluginContext", () => ({
  usePlugins: () => ({ refreshActivePlugins: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@/context/PermissionContext", () => ({
  usePermissions: () => ({ isSuperuser: true }),
}));

const plugin = { id: "plugin-1", verbose_name: "Test", version: "1.0" } as any;
const paginated = (results: any) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});
const apiResponse = (data: any) => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {},
});

describe("usePluginConfigDialog", () => {
  it("fetches details and permissions when open", async () => {
    vi.mocked(api.get).mockResolvedValue(apiResponse({ config: { a: 1 } }) as any);
    vi.mocked(permissionService.getRoles).mockResolvedValue(
      paginated([{ id: 1, name: "Admin" }]) as any
    );
    vi.mocked(permissionService.getAllGroups).mockResolvedValue(
      paginated([{ id: 1, name: "Users" }]) as any
    );

    const { result } = renderHook(() => usePluginConfigDialog(plugin, true, vi.fn(), vi.fn()));
    await waitFor(() => expect(result.current.details).toEqual({ config: { a: 1 } }));
    expect(result.current.config).toEqual({ a: 1 });
    expect(result.current.roles.length).toBe(1);
    expect(result.current.permissionActions).toEqual(["view", "manage"]);
  });

  it("does nothing when plugin is null", () => {
    const { result } = renderHook(() => usePluginConfigDialog(null, true, vi.fn(), vi.fn()));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isPermissionsLoading).toBe(false);
  });

  it("updates permission", async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes("/permissions/")) {
        return Promise.resolve(apiResponse([{ action: "view", allowed: false }]) as any);
      }
      return Promise.resolve(apiResponse({ config: {} }) as any);
    });
    vi.mocked(permissionService.getRoles).mockResolvedValue(paginated([]) as any);
    vi.mocked(permissionService.getAllGroups).mockResolvedValue(paginated([]) as any);
    vi.mocked(api.post).mockResolvedValue(apiResponse({ action: "view", is_public: true }) as any);

    const { result } = renderHook(() => usePluginConfigDialog(plugin, true, vi.fn(), vi.fn()));
    await waitFor(() => expect(result.current.isPermissionsLoading).toBe(false));
    await act(async () => {
      await result.current.handlePermissionUpdate("view", { is_public: true });
    });
    expect(api.post).toHaveBeenCalled();
    expect(result.current.permissions[0].is_public).toBe(true);
  });

  it("handles save", async () => {
    vi.mocked(api.get).mockResolvedValue(apiResponse({ config: {} }) as any);
    vi.mocked(permissionService.getRoles).mockResolvedValue(paginated([]) as any);
    vi.mocked(permissionService.getAllGroups).mockResolvedValue(paginated([]) as any);
    vi.mocked(api.post).mockResolvedValue(apiResponse({ config: { a: 1 } }) as any);
    const onConfigSaved = vi.fn();

    const { result } = renderHook(() =>
      usePluginConfigDialog(plugin, true, onConfigSaved, vi.fn())
    );
    await waitFor(() => expect(result.current.isPermissionsLoading).toBe(false));
    await act(async () => {
      await result.current.handleSave();
    });
    expect(api.post).toHaveBeenCalled();
    expect(onConfigSaved).toHaveBeenCalled();
  });

  it("handles fetch errors", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("fail"));
    vi.mocked(permissionService.getRoles).mockRejectedValue(new Error("fail"));
    vi.mocked(permissionService.getAllGroups).mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => usePluginConfigDialog(plugin, true, vi.fn(), vi.fn()));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.details).toBeNull();
  });
});
