import { useQuery } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import type { PendingMonthEntry } from "@/types";

interface UsePendingMonthsProps {
  canManageTeam: boolean;
}

/**
 * Fetches months that contain pending items for each type (overtime, standby,
 * leave). Used by the approval dashboard to let users click a pending count
 * card and jump to the next month that has pending items.
 *
 * The endpoints return `[{ month: "2026-01-01", count: 5 }, ...]` sorted
 * ascending. No date filtering — these are ALL pending months for the TL's
 * team.
 */
export const usePendingMonths = ({ canManageTeam }: UsePendingMonthsProps) => {
  const overtime = useQuery({
    queryKey: ["team", "overtime", "pending-months"],
    queryFn: () => overtimeService.getTeamPendingMonths(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  const standby = useQuery({
    queryKey: ["team", "standby", "pending-months"],
    queryFn: () => standbyService.getTeamPendingMonths(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  const leave = useQuery({
    queryKey: ["team", "leave", "pending-months"],
    queryFn: () => leaveService.getTeamPendingMonths(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: canManageTeam,
  });

  return {
    overtime: (overtime.data as PendingMonthEntry[] | undefined) ?? [],
    standby: (standby.data as PendingMonthEntry[] | undefined) ?? [],
    leave: (leave.data as PendingMonthEntry[] | undefined) ?? [],
    isLoading: {
      overtime: overtime.isLoading,
      standby: standby.isLoading,
      leave: leave.isLoading,
    },
  };
};
