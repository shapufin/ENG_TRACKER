import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { dashboardService } from "@/services/dashboardService";
import { leaveService } from "@/services/leaveService";
import { deriveFullName } from "@/lib/user-utils";
import type { User } from "@/types";

interface WorkspaceUserGroup {
  workspaceId: number;
  users: User[];
}

interface WorkspaceUsersResult {
  groups: WorkspaceUserGroup[];
  failedWorkspaceIds: number[];
}

interface UseCalendarQueriesOptions {
  userId?: number;
  selectedWorkspaceIds: number[];
  workspaceScope: string;
  canViewTeamBalances: boolean;
}

/**
 * Custom hook for calendar-related data fetching.
 * Centralizes workspace users and balance queries.
 *
 * Extracted from CalendarPage to reduce complexity.
 */
export const useCalendarQueries = ({
  userId,
  selectedWorkspaceIds,
  workspaceScope,
  canViewTeamBalances,
}: UseCalendarQueriesOptions) => {
  const { data: workspaceUsersResult, isLoading: usersLoading } = useQuery<WorkspaceUsersResult>({
    queryKey: ["workspace", "users", selectedWorkspaceIds],
    queryFn: async () => {
      if (selectedWorkspaceIds.length === 0) {
        return { groups: [], failedWorkspaceIds: [] };
      }
      const results = await Promise.allSettled(
        selectedWorkspaceIds.map((id) =>
          dashboardService.getWorkspaceUsers(id).then((users) => ({ workspaceId: id, users }))
        )
      );
      return {
        groups: results
          .filter(
            (result): result is PromiseFulfilledResult<WorkspaceUserGroup> =>
              result.status === "fulfilled"
          )
          .map((result) => result.value),
        failedWorkspaceIds: results.flatMap((result, index) =>
          result.status === "rejected" ? [selectedWorkspaceIds[index]] : []
        ),
      };
    },
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: selectedWorkspaceIds.length > 0,
  });

  const workspaceUsersData = workspaceUsersResult?.groups;
  const workspaceUsersPartial = (workspaceUsersResult?.failedWorkspaceIds.length ?? 0) > 0;

  const normalizedWorkspaceUsers = useMemo(() => {
    if (!workspaceUsersData || workspaceUsersData.length === 0) return [] as User[];
    const uniqueUsers = new Map<number, User>();
    workspaceUsersData.forEach((group) => {
      group.users.forEach((user) => {
        if (!uniqueUsers.has(user.id)) {
          uniqueUsers.set(user.id, { ...user, full_name: deriveFullName(user) });
        }
      });
    });
    return Array.from(uniqueUsers.values());
  }, [workspaceUsersData]);

  const groupedWorkspaceUsers = useMemo(() => {
    if (!workspaceUsersData) return [] as WorkspaceUserGroup[];
    return workspaceUsersData.map((group) => ({
      workspaceId: group.workspaceId,
      users: group.users.map((user) => ({ ...user, full_name: deriveFullName(user) })),
    }));
  }, [workspaceUsersData]);

  const { data: balancesData, isLoading: balancesLoading } = useQuery({
    // Include userId so admin-impersonation / user switch never reuses stale cache.
    queryKey: ["vacations", "balances", userId ?? "anonymous"],
    queryFn: () => leaveService.getBalances(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!userId,
  });

  const { data: teamBalancesData } = useQuery({
    // workspaceScope already encodes selected IDs; gate fetch on canViewTeamBalances.
    queryKey: ["vacations", "team-balances", workspaceScope],
    queryFn: () => leaveService.getTeamBalances({ workspace_ids: workspaceScope }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: canViewTeamBalances && !!workspaceScope,
  });

  return {
    workspaceUsersData,
    workspaceUsersPartial,
    normalizedWorkspaceUsers,
    groupedWorkspaceUsers,
    balancesData,
    teamBalancesData,
    isLoading: usersLoading || balancesLoading,
  };
};
