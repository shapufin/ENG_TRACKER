import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useResourceGroups } from "./useResourceGroups";
import { permissionService } from "@/services/permissionService";

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

vi.mock("@/services/permissionService", () => ({
  permissionService: {
    getGroups: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
  },
}));

vi.mock("@/lib/error-handler", () => ({
  handleApiError: vi.fn(),
}));

const emptyResult = { count: 0, results: [], next: null, previous: null };

describe("useResourceGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(permissionService.getGroups).mockResolvedValue(emptyResult);
  });

  it("passes search, page, and pageSize to getGroups", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useResourceGroups({ search: "analytics", page: 2, pageSize: 25 }), {
      wrapper: createWrapper(queryClient),
    });

    expect(permissionService.getGroups).toHaveBeenCalledWith({
      search: "analytics",
      page: 2,
      page_size: 25,
    });
  });

  it("passes undefined search when search is empty", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useResourceGroups({ search: "", page: 1, pageSize: 25 }), {
      wrapper: createWrapper(queryClient),
    });

    expect(permissionService.getGroups).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      page_size: 25,
    });
  });

  it("createGroup invalidates the groups query scope", async () => {
    vi.mocked(permissionService.createGroup).mockResolvedValue({ id: 1 } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useResourceGroups({ search: "", page: 1, pageSize: 25 }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.createGroup.mutateAsync({ name: "New Group", code: "NEW" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "groups"],
    });
  });

  it("updateGroup invalidates both groups list and the specific group detail", async () => {
    vi.mocked(permissionService.updateGroup).mockResolvedValue({ id: 5 } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useResourceGroups({ search: "", page: 1, pageSize: 25 }), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateGroup.mutateAsync({ id: 5, payload: { name: "Updated" } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "groups"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["resource-access", "group", 5],
    });
  });
});
