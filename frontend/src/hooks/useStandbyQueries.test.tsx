import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useStandbyQueries } from "./useStandbyQueries";
import { standbyService } from "@/services/standbyService";
import { userService } from "@/services/userService";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/standbyService", () => ({
  standbyService: {
    getLogs: vi.fn(),
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

describe("useStandbyQueries", () => {
  it("loads data and exposes mutations", async () => {
    vi.mocked(standbyService.getLogs).mockResolvedValue({ results: [{ id: 1, user: 5 }] } as any);
    vi.mocked(userService.getUsers).mockResolvedValue({ results: [] } as any);

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useStandbyQueries({ userId: 5, isAdmin: true }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.logs.length).toBe(1));
    expect(result.current.createMutation).toBeDefined();
  });

  it("calls all mutations and weekly create", async () => {
    vi.mocked(standbyService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(standbyService.createLog).mockResolvedValue({} as any);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStandbyQueries({ userId: 1 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await result.current.createMutation.mutateAsync({} as any);
    result.current.updateMutation.mutate({ id: 1, payload: {} });
    result.current.deleteMutation.mutate(1);
    result.current.approveMutation.mutate(1);
    result.current.rejectMutation.mutate({ id: 1, reason: "no" });
    result.current.createWeeklyMutation.mutate([{ date: "2024-01-01" }] as any);
    await waitFor(() => expect(standbyService.createLog).toHaveBeenCalled());
    expect(standbyService.updateLog).toHaveBeenCalled();
    expect(standbyService.deleteLog).toHaveBeenCalled();
    expect(standbyService.approve).toHaveBeenCalled();
    expect(standbyService.reject).toHaveBeenCalled();
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["standby"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["dashboard"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["team", "standby"], refetchType: "active" })
      )
    );
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["admin", "standby"], refetchType: "active" })
      )
    );
  });

  it("handles weekly create with failures", async () => {
    vi.mocked(standbyService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(standbyService.createLog).mockRejectedValue(new Error("bad"));

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useStandbyQueries({ userId: 1 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.createWeeklyMutation.mutate([{ date: "2024-01-01" }] as any);
    await waitFor(() => expect(standbyService.createLog).toHaveBeenCalled());
  });
});
