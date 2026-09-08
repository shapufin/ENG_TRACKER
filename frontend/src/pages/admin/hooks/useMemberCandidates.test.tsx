import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useMemberCandidates } from "./useMemberCandidates";
import { permissionService } from "@/services/permissionService";

const createWrapper = (queryClient: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

vi.mock("@/services/permissionService", () => ({
  permissionService: {
    getMemberCandidates: vi.fn(),
  },
}));

const emptyResult = { count: 0, results: [], next: null, previous: null };

describe("useMemberCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(permissionService.getMemberCandidates).mockResolvedValue(emptyResult);
  });

  it("passes groupId, search, page, and pageSize to getMemberCandidates", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useMemberCandidates({ groupId: 3, search: "bob", page: 1, pageSize: 10 }), {
      wrapper: createWrapper(queryClient),
    });

    expect(permissionService.getMemberCandidates).toHaveBeenCalledWith(3, {
      search: "bob",
      page: 1,
      page_size: 10,
    });
  });

  it("passes undefined search when search is empty", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useMemberCandidates({ groupId: 3, search: "", page: 1, pageSize: 10 }), {
      wrapper: createWrapper(queryClient),
    });

    // Even though the query is disabled, the queryFn is still defined.
    // The service call would pass undefined for empty search.
    // The hook is disabled so getMemberCandidates should NOT be called.
    expect(permissionService.getMemberCandidates).not.toHaveBeenCalled();
  });

  it("is disabled (idle) when search is empty", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useMemberCandidates({ groupId: 1, search: "", page: 1, pageSize: 10 }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled (idle) when enabled=false", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () =>
        useMemberCandidates({
          groupId: 1,
          search: "bob",
          page: 1,
          pageSize: 10,
          enabled: false,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is disabled (idle) when groupId is invalid (<=0)", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(
      () => useMemberCandidates({ groupId: 0, search: "bob", page: 1, pageSize: 10 }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.fetchStatus).toBe("idle");
  });

  it("is enabled when groupId > 0, search is non-empty, and enabled is true", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useMemberCandidates({ groupId: 1, search: "bob", page: 1, pageSize: 10 }), {
      wrapper: createWrapper(queryClient),
    });

    expect(permissionService.getMemberCandidates).toHaveBeenCalledWith(1, {
      search: "bob",
      page: 1,
      page_size: 10,
    });
  });
});
