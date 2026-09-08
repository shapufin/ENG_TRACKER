import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { standbyService } from "@/services/standbyService";

interface UseCalendarEventQueriesOptions {
  workspaceScope: string;
  hasWorkspaceSelection: boolean;
  canFetchCalendarData: boolean;
  showStandby: boolean;
}

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
    queryFn: () => standbyService.getLogs({ workspace_ids: workspaceScope, calendar: true }),
    enabled: hasWorkspaceSelection && canFetchCalendarData && showStandby,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
  });

  const {
    data: leaveRequestsData,
    isLoading: leaveLoading,
    error: leaveError,
  } = useQuery({
    queryKey: ["vacations", "calendar", workspaceScope],
    queryFn: () => leaveService.getRequests({ workspace_ids: workspaceScope, calendar: true }),
    enabled: hasWorkspaceSelection,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
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
    refetch,
  };
};
