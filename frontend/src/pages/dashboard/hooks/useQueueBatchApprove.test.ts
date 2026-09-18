import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQueueBatchApprove } from "./useQueueBatchApprove";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { bulkApprove: vi.fn() },
}));
vi.mock("@/services/standbyService", () => ({
  standbyService: { bulkApprove: vi.fn() },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: { bulkApprove: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

const highlights = [
  { id: 1, type: "overtime", status: "pending" },
  { id: 2, type: "overtime", status: "approved" },
  { id: 3, type: "standby", status: "pending" },
  { id: 4, type: "leave", status: "pending" },
];

const renderWithClient = (props: { highlights: typeof highlights }) => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useQueueBatchApprove(props), { wrapper });
};

describe("useQueueBatchApprove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(overtimeService.bulkApprove).mockResolvedValue({
      approved_count: 1,
      failed_ids: [],
      total_requested: 1,
    });
    vi.mocked(standbyService.bulkApprove).mockResolvedValue({
      approved_count: 1,
      failed_ids: [],
      total_requested: 1,
    });
    vi.mocked(leaveService.bulkApprove).mockResolvedValue({
      approved_count: 0,
      failed_ids: [4],
      total_requested: 1,
    });
  });

  it("groups pending highlight ids by type and calls each domain's bulkApprove", async () => {
    const { result } = renderWithClient({ highlights });

    result.current.batchApprove();

    await waitFor(() => expect(result.current.isBatchApproving).toBe(false));

    expect(overtimeService.bulkApprove).toHaveBeenCalledWith([1]);
    expect(standbyService.bulkApprove).toHaveBeenCalledWith([3]);
    expect(leaveService.bulkApprove).toHaveBeenCalledWith([4]);
  });

  it("skips types with no pending items", async () => {
    const { result } = renderWithClient({
      highlights: [{ id: 1, type: "overtime", status: "pending" }],
    });

    result.current.batchApprove();

    await waitFor(() => expect(result.current.isBatchApproving).toBe(false));

    expect(overtimeService.bulkApprove).toHaveBeenCalledWith([1]);
    expect(standbyService.bulkApprove).not.toHaveBeenCalled();
    expect(leaveService.bulkApprove).not.toHaveBeenCalled();
  });
});
