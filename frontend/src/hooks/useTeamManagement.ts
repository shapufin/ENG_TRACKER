import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { useInvalidateVacationData } from "@/hooks/useInvalidateVacationData";
import { toast } from "sonner";

/**
 * Custom hook for team management queries and mutations.
 * Centralizes all team-related administrative logic.
 *
 * Extracted from TeamManagementPage to reduce complexity.
 */
export const useTeamManagement = () => {
  const qc = useQueryClient();
  const invalidateVacationData = useInvalidateVacationData();

  // Include page_size in keys so changing fetch size never serves a stale page.
  const teamPageSize = 500;

  // Overtime data
  const { data: overtimeLogs, isLoading: otLoading } = useQuery({
    queryKey: ["team", "overtime", "logs", teamPageSize],
    queryFn: () => overtimeService.getTeamLogs({ page_size: teamPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Standby data
  const { data: standbyLogs, isLoading: sbLoading } = useQuery({
    queryKey: ["team", "standby", "logs", teamPageSize],
    queryFn: () => standbyService.getTeamLogs({ page_size: teamPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Leave data
  const { data: leaveRequests, isLoading: leaveLoading } = useQuery({
    queryKey: ["team", "leave", "requests", teamPageSize],
    queryFn: () => leaveService.getTeamLogs({ page_size: teamPageSize }),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Team members data
  const { data: teamMembers } = useQuery({
    queryKey: ["team", "members"],
    queryFn: () => userService.getMyTeamMembers(),
    refetchOnMount: true,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // Team balances data
  const { data: teamBalances } = useQuery({
    queryKey: ["team", "balances"],
    queryFn: () => leaveService.getTeamBalances(),
    refetchOnMount: true,
    staleTime: 0,
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
