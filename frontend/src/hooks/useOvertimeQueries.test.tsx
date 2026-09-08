import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useOvertimeQueries } from "./useOvertimeQueries";
import { overtimeService } from "@/services/overtimeService";
import { userService } from "@/services/userService";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: {
    getLogs: vi.fn(),
    getSummary: vi.fn(),
    getClients: vi.fn(),
    createLog: vi.fn(),
    updateLog: vi.fn(),
    deleteLog: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));

vi.mock("@/services/userService", () => ({
  userService: { getUsers: vi.fn() },
}));

vi.mock("@/lib/query-date-utils", () => ({ buildCurrentMonthDateParams: () => ({}) }));

vi.mock("./useMutationHandlers", () => ({
  createCreateHandlers: (refreshFn: any, __: any, options: any) => ({
    onSuccess: async () => {
      await refreshFn();
      await options?.onSuccess?.();
    },
  }),
  createUpdateHandlers: (refreshFn: any, __: any, options: any) => ({
    onSuccess: async () => {
      await refreshFn();
      await options?.onSuccess?.();
    },
  }),
  createDeleteHandlers: (refreshFn: any, __: any, options: any) => ({
    onSuccess: async () => {
      await refreshFn();
      await options?.onSuccess?.();
    },
  }),
  createApprovalHandlers: (refreshFn: any, options: any) => ({
    onSuccess: async () => {
      await refreshFn();
      await options?.onSuccess?.();
    },
  }),
  createRejectionHandlers: (refreshFn: any, options: any) => ({
    onSuccess: async () => {
      await refreshFn();
      await options?.onSuccess?.();
    },
  }),
}));

describe("useOvertimeQueries", () => {
  it("loads data and exposes mutations for user", async () => {
    vi.mocked(overtimeService.getLogs).mockResolvedValue({ results: [{ id: 1, user: 5 }] } as any);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({ total: 10 } as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    vi.mocked(userService.getUsers).mockResolvedValue({ results: [] } as any);

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useOvertimeQueries({ userId: 5, isAdmin: true }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.logs.length).toBe(1));
    expect(result.current.summary).toEqual({ total: 10 });
    expect(result.current.createMutation).toBeDefined();
  });

  it("returns empty logs when userId is undefined", async () => {
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useOvertimeQueries({}), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.logs).toEqual([]));
  });

  it("calls mutations", async () => {
    vi.mocked(overtimeService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({} as any);
    vi.mocked(overtimeService.getClients).mockResolvedValue([] as any);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useOvertimeQueries({ userId: 1 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.createMutation.mutateAsync({} as any);
    result.current.updateMutation.mutate({ id: 1, payload: {} });
    result.current.deleteMutation.mutate(1);
    result.current.approveMutation.mutate(1);
    result.current.rejectMutation.mutate({ id: 1, reason: "no" });
    await waitFor(() => expect(overtimeService.createLog).toHaveBeenCalled());
    expect(overtimeService.updateLog).toHaveBeenCalled();
    expect(overtimeService.deleteLog).toHaveBeenCalled();
    expect(overtimeService.approve).toHaveBeenCalled();
    expect(overtimeService.reject).toHaveBeenCalled();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["overtime"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["dashboard"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["team", "overtime"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["admin", "overtime"], refetchType: "active" })
      )
    );
  });
});
