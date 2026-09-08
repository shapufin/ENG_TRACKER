import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useHRReportQueries } from "./useHRReportQueries";
import * as reportService from "@/services/reportService";
import * as leaveService from "@/services/leaveService";

vi.mock("@/services/reportService", () => ({
  reportService: {
    getSummary: vi.fn(),
    getDetailed: vi.fn(),
    getInsights: vi.fn(),
    getTopTeamLeaders: vi.fn(),
  },
}));

vi.mock("@/services/leaveService", () => ({
  leaveService: { getRequests: vi.fn() },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useHRReportQueries", () => {
  it("builds filter params and exposes refetchAll", async () => {
    vi.mocked(reportService.reportService.getSummary).mockResolvedValue({} as any);
    vi.mocked(reportService.reportService.getDetailed).mockResolvedValue({} as any);
    vi.mocked(reportService.reportService.getInsights).mockResolvedValue({} as any);
    vi.mocked(reportService.reportService.getTopTeamLeaders).mockResolvedValue({} as any);
    vi.mocked(leaveService.leaveService.getRequests).mockResolvedValue({} as any);

    const { result } = renderHook(
      () =>
        useHRReportQueries({
          start: "2024-01-01",
          end: "2024-01-31",
          selectedItalianTL: "1",
          selectedAlbanianTL: "all",
          selectedTeam: "2",
          selectedWorkspace: "all",
        }),
      { wrapper }
    );

    expect(result.current.refetchAll).toBeDefined();
    await waitFor(() => expect(result.current.refetchAll).toBeDefined());
    await result.current.refetchAll();
    expect(reportService.reportService.getSummary).toHaveBeenCalled();
    expect(reportService.reportService.getDetailed).toHaveBeenCalled();
    expect(leaveService.leaveService.getRequests).toHaveBeenCalled();
  });

  it("uses all filter values as undefined when all selected", async () => {
    const { result } = renderHook(
      () =>
        useHRReportQueries({
          start: "2024-01-01",
          end: "2024-01-31",
          selectedItalianTL: "all",
          selectedAlbanianTL: "all",
          selectedTeam: "all",
          selectedWorkspace: "all",
        }),
      { wrapper }
    );
    expect(result.current.summaryData).toBeUndefined();
    await result.current.refetchAll();
    expect(reportService.reportService.getInsights).toHaveBeenCalledWith({
      start_date: "2024-01-01",
      end_date: "2024-01-31",
      italian_tl_id: undefined,
      albanian_tl_id: undefined,
      team_ids: undefined,
      workspace_ids: undefined,
    });
  });
});
