import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useResourceGroupDetail } from "./useResourceGroupDetail";
import { permissionService } from "@/services/permissionService";

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

vi.mock("@/services/permissionService", () => ({
  permissionService: {
    getGroup: vi.fn(),
    getUserGroups: vi.fn(),
    createUserGroup: vi.fn(),
    deleteUserGroup: vi.fn(),
    updateGroup: vi.fn(),
  },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

const emptyResult = { count: 0, results: [], next: null, previous: null };
const groupResult = { id: 1, name: "Test", code: "TST" };

describe("useResourceGroupDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(permissionService.getGroup).mockResolvedValue(groupResult);
    vi.mocked(permissionService.getUserGroups).mockResolvedValue(emptyResult);
  });

  it("calls getGroup with the correct groupId", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 42,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(permissionService.getGroup).toHaveBeenCalledWith(42);
  });

  it("passes member search, page, and pageSize to getUserGroups", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 7,
          memberSearch: "alice",
          memberPage: 3,
          memberPageSize: 10,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(permissionService.getUserGroups).toHaveBeenCalledWith({
      group: 7,
      search: "alice",
      page: 3,
      page_size: 10,
    });
  });

  it("passes undefined search when memberSearch is empty", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 7,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(permissionService.getUserGroups).toHaveBeenCalledWith({
      group: 7,
      search: undefined,
      page: 1,
      page_size: 25,
    });
  });

  it("addMember invalidates members, group detail, and directory", async () => {
    vi.mocked(permissionService.createUserGroup).mockResolvedValue({ id: 1 } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 5,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.addMember.mutateAsync({ user: 10, group: 5 });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "members", 5],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "group", 5],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "groups"],
    });
  });

  it("removeMember invalidates members, group detail, and directory", async () => {
    vi.mocked(permissionService.deleteUserGroup).mockResolvedValue(undefined);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 5,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.removeMember.mutateAsync(99);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "members", 5],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "group", 5],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "groups"],
    });
  });

  it("updateGroup invalidates the specific group detail and directory", async () => {
    vi.mocked(permissionService.updateGroup).mockResolvedValue({ id: 5 } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 5,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.updateGroup.mutateAsync({ id: 5, payload: { name: "Updated" } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "group", 5],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "groups"],
    });
  });

  it("does not invalidate non-resource-access queries on member mutation", async () => {
    vi.mocked(permissionService.createUserGroup).mockResolvedValue({ id: 1 } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () =>
        useResourceGroupDetail({
          groupId: 5,
          memberSearch: "",
          memberPage: 1,
          memberPageSize: 25,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.addMember.mutateAsync({ user: 10, group: 5 });
    });

    // Every invalidation should target a "resource-access" key.
    for (const call of invalidateSpy.mock.calls) {
      const key = (call[0] as { queryKey: unknown[] }).queryKey;
      expect(key[0]).toBe("resource-access");
    }
  });
});
