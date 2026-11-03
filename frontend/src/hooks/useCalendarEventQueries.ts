import { useCallback } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { standbyService } from "@/services/standbyService";

interface UseCalendarEventQueriesOptions {
  workspaceScope: string;
  hasWorkspaceSelection: boolean;
  canFetchCalendarData: boolean;
  showStandby: boolean;
}

/** The calendar fetches one capped page (page_size 10000); more rows on the server means events are missing. */
export const isTruncatedPage = (page?: { count?: number; results?: unknown[] }): boolean =>
  typeof page?.count === "number" && page.count > (page.results?.length ?? 0);

export const useCalendarEventQueries = ({
  workspaceScope,
  hasWorkspaceSelection,
  canFetchCalendarData,
  showStandby,
}: UseCalendarEventQueriesOptions) => {
  const queryClient = useQueryClient();

  const {
    data: standbyData,
    isLoading: sbLoading,
    error: sbError,
  } = useQuery({
    queryKey: ["standby", "calendar", workspaceScope],
    // ignore_date_filter: the backend defaults to the current month, which
    // would hide standby from every other month. page_size=10000 lifts the
    // default 50-row page cap (LargeResultsPagination max).
    queryFn: () =>
      standbyService.getLogs({
        workspace_ids: workspaceScope,
        calendar: true,
        ignore_date_filter: "true",
        page_size: 10000,
      }),
    enabled: hasWorkspaceSelection && canFetchCalendarData && showStandby,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    // Deliberate exception to the app-wide "no background polling" default:
    // conflicts and coverage are derived from these two feeds, and a shared
    // calendar that only refreshes on reload shows a stale staffing picture for
    // whoever else booked time off. Foreground only (React Query's default).
    refetchInterval: 60_000,
  });

  const {
    data: leaveRequestsData,
    isLoading: leaveLoading,
    error: leaveError,
  } = useQuery({
    queryKey: ["vacations", "calendar", workspaceScope],
    queryFn: () =>
      leaveService.getRequests({ workspace_ids: workspaceScope, calendar: true, page_size: 10000 }),
    enabled: hasWorkspaceSelection,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    /** Same deliberate 60s foreground poll as the standby feed (coverage + conflicts). */
    refetchInterval: 60_000,
  });

  const {
    data: holidayData,
    isLoading: holidayLoading,
    error: holidayError,
  } = useQuery({
    queryKey: ["holidays", "calendar"],
    queryFn: () => dashboardService.getHolidays(),
    enabled: hasWorkspaceSelection,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const isLoading = sbLoading || leaveLoading || holidayLoading;
  const hasError = !!sbError || !!leaveError || !!holidayError;
  const eventsTruncated = isTruncatedPage(standbyData) || isTruncatedPage(leaveRequestsData);

  const refetch = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ["standby", "calendar"] });
    queryClient.refetchQueries({ queryKey: ["vacations", "calendar"] });
    queryClient.refetchQueries({ queryKey: ["holidays"] });
    queryClient.refetchQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  return {
    standbyData,
    leaveRequestsData,
    holidayData,
    isLoading,
    hasError,
    eventsTruncated,
    refetch,
  };
};
