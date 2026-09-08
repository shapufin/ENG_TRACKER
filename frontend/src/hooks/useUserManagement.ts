import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";
import type { ApiError } from "@/types";

interface UseUserManagementOptions {
  onUpdateSuccess?: () => void;
  onCreateSuccess?: () => void;
  onResetSuccess?: () => void;
  onDeleteSuccess?: () => void;
}

/**
 * Custom hook for user management queries and mutations.
 * Centralizes all user-related administrative logic.
 *
 * Extracted from UsersPage to reduce complexity.
 */
export const useUserManagement = (options?: UseUserManagementOptions) => {
  const qc = useQueryClient();

  const {
    data: profiles,
    isLoading: profilesLoading,
    isError: isProfilesError,
    error: profilesError,
  } = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: () => userService.getProfiles(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: teams } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: techs } = useQuery({
    queryKey: ["admin", "techs"],
    queryFn: () => userService.getTechs({ is_active: true }),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: italianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "italian"],
    queryFn: () => userService.getItalianTeamLeaders(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: albanianTLs } = useQuery({
    queryKey: ["admin", "team-leaders", "albanian"],
    queryFn: () => userService.getAlbanianTeamLeaders(),
    refetchOnMount: true,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin", "user-stats"],
    queryFn: () => userService.getUserStats(),
    refetchOnMount: true,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: Parameters<typeof userService.updateUser>[1];
    }) => userService.updateUser(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Updated");
      options?.onUpdateSuccess?.();
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => handleApiError(err),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Parameters<typeof userService.createUser>[0]) =>
      userService.createUser(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User created");
      options?.onCreateSuccess?.();
    },
    onError: (err: ApiError) => {
      handleApiError(err);
      // Let component handle specific field errors from err.response.data
    },
  });

  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      userService.resetPassword(id, password),
    onSuccess: () => {
      toast.success("Password reset");
      options?.onResetSuccess?.();
    },
    onError: (err) => handleApiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => userService.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("User deleted");
      options?.onDeleteSuccess?.();
    },
    onError: (err) => handleApiError(err),
  });

  return {
    profiles: profiles?.results ?? [],
    teams: teams?.results ?? [],
    techs: techs?.results ?? [],
    italianTLs,
    albanianTLs,
    stats,
    isLoading: profilesLoading,
    isError: isProfilesError,
    error: profilesError,
    updateMutation,
    createMutation,
    resetMutation,
    deleteMutation,
  };
};
