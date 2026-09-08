/**
 * Tests that the dashboard hook uses React Query keys that include
 * every result-changing parameter (CONTEXT.md rule #8).
 *
 * statusMode and includeRejected are now hardcoded (approved_only, false)
 * and removed from the hook interface — the CR dashboard is a clean
 * approved-only view. Trend query removed (overview deleted).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useControlRoomDashboard } from "./useControlRoomDashboard";
import { controlRoomService } from "../services/controlRoomService";
import type { ControlRoomSummaryResponse, ControlRoomRosterResponse } from "../types";

const mockSummary: ControlRoomSummaryResponse = {
  date_from: "2026-07-01",
  date_to: "2026-07-31",
  scope: { is_global: true, team_ids: null },
  summary: {
    team_count: 1,
    covered_team_count: 1,
    uncovered_team_count: 0,
    person_count: 2,
    standby_entry_count: 4,
    planned_hours: 16,
    approved_hours: 8,
    pending_hours: 0,
  },
  coverage_by_team: [],
};

const mockRoster: ControlRoomRosterResponse = {
  count: 0,
  page: 1,
  page_size: 500,
  total_pages: 0,
  results: [],
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useControlRoomDashboard query keys", () => {
  let getSummarySpy: ReturnType<typeof vi.spyOn>;
  let getRosterSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getSummarySpy = vi.spyOn(controlRoomService, "getSummary").mockResolvedValue(mockSummary);
    getRosterSpy = vi.spyOn(controlRoomService, "getRoster").mockResolvedValue(mockRoster);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-fetches summary when dateFrom or teamIds changes", async () => {
    const { rerender } = renderHook(
      (props) =>
        useControlRoomDashboard({
          dateFrom: props.dateFrom,
          dateTo: "2026-07-31",
          selectedTeamIds: props.teamIds,
          search: "",
          rosterPage: 1,
          enabled: true,
        }),
      {
        wrapper: createWrapper(),
        initialProps: {
          dateFrom: "2026-07-01",
          teamIds: [] as number[],
        },
      }
    );

    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(1));

    // Change dateFrom
    rerender({ dateFrom: "2026-07-02", teamIds: [] });
    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(2));

    // Change teamIds (select one team)
    rerender({ dateFrom: "2026-07-02", teamIds: [5] });
    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(3));
  });

  it("re-fetches roster but NOT summary when search changes", async () => {
    const { rerender } = renderHook(
      (props) =>
        useControlRoomDashboard({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          selectedTeamIds: [],
          search: props.search,
          rosterPage: 1,
          enabled: true,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { search: "" },
      }
    );

    await waitFor(() => expect(getRosterSpy).toHaveBeenCalledTimes(1));
    const summaryCountAfterFirst = getSummarySpy.mock.calls.length;

    // Change search — roster should re-fetch
    rerender({ search: "alice" });
    await waitFor(() => expect(getRosterSpy).toHaveBeenCalledTimes(2));

    // Summary should NOT have been called again (search is not in its key)
    expect(getSummarySpy.mock.calls.length).toBe(summaryCountAfterFirst);
  });

  it("always passes status_mode=approved_only and include_rejected=false", async () => {
    renderHook(
      () =>
        useControlRoomDashboard({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          selectedTeamIds: [],
          search: "",
          rosterPage: 1,
          enabled: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(1));
    const summaryCall = getSummarySpy.mock.calls[0][0];
    expect(summaryCall.status_mode).toBe("approved_only");
    expect(summaryCall.include_rejected).toBe(false);
  });

  it("sends team_ids as comma-separated string when teams are selected", async () => {
    renderHook(
      () =>
        useControlRoomDashboard({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          selectedTeamIds: [1, 2, 3],
          search: "",
          rosterPage: 1,
          enabled: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(1));
    const summaryCall = getSummarySpy.mock.calls[0][0];
    expect(summaryCall.team_ids).toBe("1,2,3");
  });

  it("sends team_ids=undefined when no teams are selected", async () => {
    renderHook(
      () =>
        useControlRoomDashboard({
          dateFrom: "2026-07-01",
          dateTo: "2026-07-31",
          selectedTeamIds: [],
          search: "",
          rosterPage: 1,
          enabled: true,
        }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(getSummarySpy).toHaveBeenCalledTimes(1));
    const summaryCall = getSummarySpy.mock.calls[0][0];
    expect(summaryCall.team_ids).toBeUndefined();
  });
});
