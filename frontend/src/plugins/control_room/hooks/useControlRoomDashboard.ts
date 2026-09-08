/**
 * useControlRoomDashboard — orchestrates the Control Room dashboard data.
 *
 * React Query keys include every parameter that changes the result
 * (CONTEXT.md rule #8): dateFrom, dateTo, selectedTeamIds.
 *
 * statusMode is hardcoded to "approved_only" and include_rejected to
 * false — the CR dashboard is a clean read-only view of approved
 * standby only. Pending/rejected shifts are irrelevant to CR users.
 *
 * Fetches summary and roster in parallel. Trend query removed (overview
 * was deleted). Roster page_size increased to 500 so client-side
 * aggregation by user works without pagination gaps — CR-scoped data is
 * small (only the user's assigned teams).
 *
 * team_ids is sent as a comma-separated string (e.g. "1,2,3") to match
 * the backend's _parse_params. An empty array means "all teams in scope".
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { controlRoomService } from "../services/controlRoomService";

export interface UseControlRoomDashboardParams {
  dateFrom: string;
  dateTo: string;
  selectedTeamIds: number[];
  search: string;
  rosterPage: number;
  enabled: boolean;
}

const STATUS_MODE = "approved_only" as const;
const INCLUDE_REJECTED = false;
const ROSTER_PAGE_SIZE = 500;

export const useControlRoomDashboard = (params: UseControlRoomDashboardParams) => {
  const { dateFrom, dateTo, selectedTeamIds, search, rosterPage, enabled } = params;

  const teamIdsParam = selectedTeamIds.length > 0 ? selectedTeamIds.join(",") : undefined;

  const baseParams = {
    date_from: dateFrom,
    date_to: dateTo,
    team_ids: teamIdsParam,
    status_mode: STATUS_MODE,
    include_rejected: INCLUDE_REJECTED,
  };

  const summaryQuery = useQuery({
    queryKey: ["control-room", "dashboard", "summary", dateFrom, dateTo, selectedTeamIds],
    queryFn: () => controlRoomService.getSummary(baseParams),
    enabled,
    staleTime: 30_000,
  });

  const rosterQuery = useQuery({
    queryKey: [
      "control-room",
      "dashboard",
      "roster",
      dateFrom,
      dateTo,
      selectedTeamIds,
      search,
      rosterPage,
      ROSTER_PAGE_SIZE,
    ],
    queryFn: () =>
      controlRoomService.getRoster({
        ...baseParams,
        search: search || undefined,
        page: rosterPage,
        page_size: ROSTER_PAGE_SIZE,
      }),
    enabled,
    staleTime: 15_000,
  });

  // Stable refetch reference — avoids causing re-renders in consumers that
  // receive this as a prop (e.g. ControlRoomFilters onRefresh).
  const refetch = useMemo(
    () => () => {
      void summaryQuery.refetch();
      void rosterQuery.refetch();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summaryQuery.refetch, rosterQuery.refetch]
  );

  return {
    summary: summaryQuery.data,
    summaryUpdatedAt: summaryQuery.dataUpdatedAt,
    roster: rosterQuery.data?.results ?? [],
    rosterCount: rosterQuery.data?.count ?? 0,
    rosterPage: rosterQuery.data?.page ?? rosterPage,
    rosterTotalPages: rosterQuery.data?.total_pages ?? 0,
    isLoading: summaryQuery.isLoading || rosterQuery.isLoading,
    isError: summaryQuery.isError || rosterQuery.isError,
    isFetching: summaryQuery.isFetching || rosterQuery.isFetching,
    refetch,
  };
};
