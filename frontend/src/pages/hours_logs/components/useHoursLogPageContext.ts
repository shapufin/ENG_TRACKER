import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { usePermissions } from "@/context/PermissionContext";

export const useHoursLogPageContext = () => {
  const { user } = useAuth();
  const { canApprove, isAdmin, isSuperuser, canViewTeamData } = usePermissions();
  const queryClient = useQueryClient();
  return { user, userId: user?.id, canApprove, isAdmin, isSuperuser, canViewTeamData, queryClient };
};
