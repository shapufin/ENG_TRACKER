import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useStandbyQueries } from "./useStandbyQueries";
import { standbyService } from "@/services/standbyService";
import { userService } from "@/services/userService";
import { createWrapper } from "@/test/hookTestUtils";
import { toast } from "sonner";

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

  it("shows the server's reason for each failed day of a weekly create", async () => {
    vi.mocked(standbyService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(standbyService.createLog)
      .mockResolvedValueOnce({} as any)
      .mockRejectedValueOnce({
        response: {
          data: { non_field_errors: ["Time range overlaps an existing standby entry."] },
        },
      });

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useStandbyQueries({ userId: 1 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.createWeeklyMutation.mutate([
      { date: "2026-11-16" },
      { date: "2026-11-21" },
    ] as any);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const message = vi.mocked(toast.error).mock.calls.at(-1)?.[0] as string;
    expect(message).toContain("2026-11-21");
    expect(message).toContain("Time range overlaps an existing standby entry.");
    expect(message).not.toContain("2026-11-16");
  });

  it("splits an overnight single entry at midnight into two rows (R5)", async () => {
    vi.mocked(standbyService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(standbyService.createLog).mockReset();
    vi.mocked(standbyService.createLog).mockResolvedValue({} as any);

    const queryClient = new QueryClient();
    const { result } = renderHook(() => useStandbyQueries({ userId: 1 }), {
      wrapper: createWrapper(queryClient),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.createMutation.mutate({
      date: "2026-11-16",
      start_time: "18:00",
      end_time: "09:00",
      description: "x",
    } as any);
    await waitFor(() => expect(standbyService.createLog).toHaveBeenCalledTimes(2));
    expect(
      vi
        .mocked(standbyService.createLog)
        .mock.calls.map(([p]) => [p.date, p.start_time, p.end_time])
    ).toEqual([
      ["2026-11-16", "18:00", "00:00"],
      ["2026-11-17", "00:00", "09:00"],
    ]);
  });
});
