import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useTeamLeaderDashboardData } from "./useTeamLeaderDashboardData";
import { dashboardService } from "@/services/dashboardService";
import { FRESH_MS } from "@/lib/queryFreshness";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getTeamStats: vi.fn().mockResolvedValue({}),
    getPendingTrend: vi.fn().mockResolvedValue([]),
    getMonthlyComparison: vi.fn().mockResolvedValue({}),
    getQueueHighlights: vi.fn().mockResolvedValue([]),
  },
}));

describe("useTeamLeaderDashboardData", () => {
  it("refreshes on window focus once the data is a minute old", async () => {
    const queryClient = new QueryClient();
    renderHook(() => useTeamLeaderDashboardData({ userId: 2, shouldQueryTeamData: true }), {
      wrapper: createWrapper(queryClient),
    });
    const queries = queryClient.getQueryCache().findAll({ queryKey: ["dashboard"] });
    expect(queries).toHaveLength(4);
    for (const query of queries) {
      const options = query.observers[0].options;
      expect(options.refetchOnWindowFocus).toBe(true);
      expect(options.staleTime).toBe(query.queryKey[1] === "queue_highlights" ? 0 : FRESH_MS);
    }
  });

  // A team_id narrows the API to one team and drops linked reports in other teams.
  it("asks for every linked report, never one team", async () => {
    renderHook(() => useTeamLeaderDashboardData({ userId: 2, shouldQueryTeamData: true }), {
      wrapper: createWrapper(new QueryClient()),
    });

    await waitFor(() => expect(dashboardService.getQueueHighlights).toHaveBeenCalled());
    expect(dashboardService.getTeamStats).toHaveBeenCalledWith();
    expect(dashboardService.getPendingTrend).toHaveBeenCalledWith();
    expect(dashboardService.getMonthlyComparison).toHaveBeenCalledWith(undefined, "month");
    expect(dashboardService.getQueueHighlights).toHaveBeenCalledWith(undefined, 20);
  });
});
