import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useTLBulkMutations } from "./useTLBulkMutations";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { toast } from "sonner";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { bulkApprove: vi.fn(), bulkReject: vi.fn() },
}));
vi.mock("@/services/standbyService", () => ({
  standbyService: { bulkApprove: vi.fn(), bulkReject: vi.fn() },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: { bulkApprove: vi.fn(), bulkReject: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

describe("useTLBulkMutations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates pending queries and vacation data after leave approval", async () => {
    vi.mocked(leaveService.bulkApprove).mockResolvedValue({
      approved_count: 2,
      failed_ids: [],
      total_requested: 2,
    });
    const invalidateVacationData = vi.fn();
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () =>
        useTLBulkMutations({
          dateFrom: "2026-08-01",
          dateTo: "2026-08-31",
          invalidateVacationData,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await result.current.bulkApproveMutation.mutateAsync({ type: "leave", ids: [1, 2] });

    expect(toast.success).toHaveBeenCalledWith("Approved 2 leave requests");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["team", "leave", "pending", "2026-08-01", "2026-08-31"],
    });
    expect(invalidateVacationData).toHaveBeenCalledOnce();
  });

  it("warns about failed rejections and still refreshes pending data", async () => {
    vi.mocked(overtimeService.bulkReject).mockResolvedValue({
      rejected_count: 1,
      failed_ids: [2],
      total_requested: 2,
    });
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(
      () => useTLBulkMutations({ dateFrom: "", dateTo: "", invalidateVacationData: vi.fn() }),
      { wrapper: createWrapper(queryClient) }
    );

    await result.current.bulkRejectMutation.mutateAsync({
      type: "overtime",
      ids: [1, 2],
      reason: "Duplicate",
    });

    expect(toast.warning).toHaveBeenCalledWith("Rejected 1 of 2 overtime requests. 1 failed.");
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["team", "overtime", "pending", "", ""],
    });
  });
});
