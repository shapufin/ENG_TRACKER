import { useQuery } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";

interface UseTeamPendingQueriesProps {
  dateFrom: string;
  dateTo: string;
  canManageTeam: boolean;
}

/**
 * Custom hook for fetching team pending requests across all types.
 * Centralizes query logic for overtime, standby, and leave requests.
 *
 * Extracted from TLApprovalDashboard to reduce complexity.
 */
export const useTeamPendingQueries = ({
  dateFrom,
  dateTo,
  canManageTeam,
}: UseTeamPendingQueriesProps) => {
  const pendingParams = {
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  };

  const {
    data: overtimePending,
    isLoading: otLoading,
    error: otError,
    refetch: otRefetch,
  } = useQuery({
    queryKey: ["team", "overtime", "pending", dateFrom, dateTo],
    queryFn: () => overtimeService.getTeamPending(pendingParams),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  const {
    data: standbyPending,
    isLoading: sbLoading,
    error: sbError,
    refetch: sbRefetch,
  } = useQuery({
    queryKey: ["team", "standby", "pending", dateFrom, dateTo],
    queryFn: () => standbyService.getTeamPending(pendingParams),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  const {
    data: leavePending,
    isLoading: leaveLoading,
    error: leaveError,
    refetch: leaveRefetch,
  } = useQuery({
    queryKey: ["team", "leave", "pending", dateFrom, dateTo],
    queryFn: () => leaveService.getTeamPending(pendingParams),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  return {
    overtime: { data: overtimePending, isLoading: otLoading, error: otError, refetch: otRefetch },
    standby: { data: standbyPending, isLoading: sbLoading, error: sbError, refetch: sbRefetch },
    leave: {
      data: leavePending,
      isLoading: leaveLoading,
      error: leaveError,
      refetch: leaveRefetch,
    },
  };
};
