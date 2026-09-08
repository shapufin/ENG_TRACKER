import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useAuditLogs } from "./useAuditLogs";
import { auditService } from "@/services/auditService";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/auditService", () => ({
  auditService: {
    getLogs: vi.fn(),
    getStats: vi.fn(),
    getLogHistory: vi.fn(),
  },
}));

describe("useAuditLogs", () => {
  it("fetches logs and server-side stats independently", async () => {
    vi.mocked(auditService.getLogs).mockResolvedValue({
      results: [{ id: 1, user: 1, user_name: "alice", action: "CREATE" }],
    } as any);
    vi.mocked(auditService.getStats).mockResolvedValue({
      total_logs: 500,
      logs_today: 12,
      logs_this_week: 87,
      logs_this_month: 312,
      unique_users: 23,
      failed_actions: 45,
      success_rate: 91.0,
    });

    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAuditLogs({ filterAction: "all", filterModel: "all", searchQuery: "" }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.logs.length).toBe(1));
    await waitFor(() => expect(result.current.stats.total_logs).toBe(500));
    expect(result.current.stats.unique_users).toBe(23);
    expect(result.current.statsLoading).toBe(false);
    // Verify the stats came from the server, not computed from logs.
    expect(auditService.getStats).toHaveBeenCalledWith({
      action: undefined,
      model_name: undefined,
      search: undefined,
    });
  });

  it("passes active filters to both logs and stats endpoints", async () => {
    vi.mocked(auditService.getLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(auditService.getStats).mockResolvedValue({
      total_logs: 5,
      logs_today: 0,
      logs_this_week: 0,
      logs_this_month: 0,
      unique_users: 1,
      failed_actions: 5,
      success_rate: 0,
    });

    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAuditLogs({ filterAction: "DELETE", filterModel: "all", searchQuery: "alice" }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.stats.total_logs).toBe(5));
    expect(auditService.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", search: "alice", page_size: 100 })
    );
    expect(auditService.getStats).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", search: "alice" })
    );
  });

  it("returns empty stats while stats query is loading", async () => {
    vi.mocked(auditService.getLogs).mockResolvedValue({ results: [] } as any);
    // Never resolves — simulates loading state.
    vi.mocked(auditService.getStats).mockReturnValue(new Promise(() => {}) as any);

    const queryClient = new QueryClient();
    const { result } = renderHook(
      () => useAuditLogs({ filterAction: "all", filterModel: "all", searchQuery: "" }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.statsLoading).toBe(true));
    expect(result.current.stats.total_logs).toBe(0);
    expect(result.current.stats.success_rate).toBe(100);
  });
});
