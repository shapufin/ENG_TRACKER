import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { useInvalidateVacationData } from "@/hooks/useInvalidateVacationData";
import { toast } from "sonner";

const TEAM_PAGE_SIZE = 5000;
const TEAM_STALE_MS = 30_000;
const MAX_TEAM_PAGES = 20;

async function fetchAllTeamPages<T>(
  fetcher: (params: { page: number; page_size: number }) => Promise<{
    results: T[];
    next?: string | null;
    count?: number;
  }>
) {
  const results: T[] = [];
  let page = 1;
  let totalCount: number | undefined;
  while (page <= MAX_TEAM_PAGES) {
    const data = await fetcher({ page, page_size: TEAM_PAGE_SIZE });
    results.push(...(data.results ?? []));
    totalCount = data.count;
    if (!data.next) break;
    page += 1;
  }
  return { results, count: totalCount ?? results.length, next: null, previous: null };
}

/**
 * Custom hook for team management queries and mutations.
 * Centralizes all team-related administrative logic.
 *
 * Extracted from TeamManagementPage to reduce complexity.
 */
export const useTeamManagement = () => {
  const qc = useQueryClient();
  const invalidateVacationData = useInvalidateVacationData();

  // Overtime data
  const { data: overtimeLogs, isLoading: otLoading } = useQuery({
    queryKey: ["team", "overtime", "logs", "all"],
    queryFn: () => fetchAllTeamPages(overtimeService.getTeamLogs),
    staleTime: TEAM_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Standby data
  const { data: standbyLogs, isLoading: sbLoading } = useQuery({
    queryKey: ["team", "standby", "logs", "all"],
    queryFn: () => fetchAllTeamPages(standbyService.getTeamLogs),
    staleTime: TEAM_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Leave data
  const { data: leaveRequests, isLoading: leaveLoading } = useQuery({
    queryKey: ["team", "leave", "requests", "all"],
    queryFn: () => fetchAllTeamPages(leaveService.getTeamLogs),
    staleTime: TEAM_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Team members data
  const { data: teamMembers } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => userService.getMyTeamMembers(),
    staleTime: TEAM_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Team balances data
  const { data: teamBalances } = useQuery({
    queryKey: ["team", "balances"],
    queryFn: () => leaveService.getTeamBalances(),
    staleTime: TEAM_STALE_MS,
    refetchOnWindowFocus: false,
  });

  // Mutations for overtime
  const otApproveMutation = useMutation({
    mutationFn: (id: number) => overtimeService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "overtime"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const otRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      overtimeService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "overtime"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Rejected");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  // Mutations for standby
  const sbApproveMutation = useMutation({
    mutationFn: (id: number) => standbyService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "standby"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const sbRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      standbyService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "standby"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Rejected");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  // Mutations for leave
  const leaveApproveMutation = useMutation({
    mutationFn: (id: number) => leaveService.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "leave"] });
      qc.invalidateQueries({ queryKey: ["team", "balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      invalidateVacationData();
      toast.success("Approved");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  const leaveRejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => leaveService.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team", "leave"] });
      qc.invalidateQueries({ queryKey: ["team", "balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      invalidateVacationData();
      toast.success("Rejected");
    },
    onError: (err: unknown) => handleApiError(err),
  });

  return {
    overtimeLogs: overtimeLogs?.results ?? [],
    standbyLogs: standbyLogs?.results ?? [],
    leaveRequests: leaveRequests?.results ?? [],
    teamMembers: teamMembers ?? [],
    teamBalances: teamBalances ?? [],
    isLoading: otLoading || sbLoading || leaveLoading,
    otApproveMutation,
    otRejectMutation,
    sbApproveMutation,
    sbRejectMutation,
    leaveApproveMutation,
    leaveRejectMutation,
    invalidateVacationData,
  };
};
