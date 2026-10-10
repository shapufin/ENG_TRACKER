/**
 * The engagement page loads summary, trend and team breakdown, and each query
 * key includes the month it depends on (CONTEXT.md rule #8).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useEngagementMetrics } from "./useEngagementMetrics";
import { engagementService } from "../../services/engagementService";

const summary = {
  month: "2026-09-01",
  team_count: 1,
  team_size: 5,
  engagement_score: 78,
  refreshed_on_read: false,
  computed_at: "2026-09-20T00:00:00Z",
};
const trend = [{ month: "2026-09-01", engagement_score: 78 }];
const teamBreakdown = [{ id: 1, team_name: "Team A" }];

type SummaryResponse = Awaited<ReturnType<typeof engagementService.getSummary>>;
type TrendResponse = Awaited<ReturnType<typeof engagementService.getTrend>>;
type BreakdownResponse = Awaited<ReturnType<typeof engagementService.getTeamBreakdown>>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useEngagementMetrics", () => {
  let getSummary: ReturnType<typeof vi.spyOn>;
  let getTrend: ReturnType<typeof vi.spyOn>;
  let getTeamBreakdown: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSummary = vi
      .spyOn(engagementService, "getSummary")
      .mockResolvedValue({ data: summary } as unknown as SummaryResponse);
    getTrend = vi
      .spyOn(engagementService, "getTrend")
      .mockResolvedValue({ data: trend } as unknown as TrendResponse);
    getTeamBreakdown = vi
      .spyOn(engagementService, "getTeamBreakdown")
      .mockResolvedValue({ data: teamBreakdown } as unknown as BreakdownResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads summary, trend and team breakdown and returns their data", async () => {
    const { result } = renderHook(() => useEngagementMetrics("2026-09-01"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.summary).toBeDefined());
    expect(getSummary).toHaveBeenCalledWith("2026-09-01");
    expect(getTeamBreakdown).toHaveBeenCalledWith("2026-09-01");
    expect(getTrend).toHaveBeenCalledWith(6);
    expect(result.current.summary).toEqual(summary);
    expect(result.current.trend).toEqual(trend);
    expect(result.current.teamBreakdown).toEqual(teamBreakdown);
    expect(result.current.isError).toBe(false);
  });

  it("refetches summary and team breakdown when the month changes", async () => {
    const { result, rerender } = renderHook((month: string) => useEngagementMetrics(month), {
      wrapper: createWrapper(),
      initialProps: "2026-08-01",
    });
    await waitFor(() => expect(result.current.summary).toBeDefined());

    rerender("2026-09-01");
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2));
    expect(getSummary).toHaveBeenLastCalledWith("2026-09-01");
    expect(getTeamBreakdown).toHaveBeenLastCalledWith("2026-09-01");
    expect(getTrend).toHaveBeenCalledTimes(1);
  });

  it("reports isError when any part fails and keeps the lists empty", async () => {
    getTrend.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useEngagementMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.trend).toEqual([]);
  });
});
