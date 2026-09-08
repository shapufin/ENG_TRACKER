import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/error-handler";
import { permissionService } from "@/services/permissionService";
import type { Group } from "@/types";

export interface UseResourceGroupDetailParams {
  groupId: number;
  memberSearch: string;
  memberPage: number;
  memberPageSize: number;
}

export function useResourceGroupDetail({
  groupId,
  memberSearch,
  memberPage,
  memberPageSize,
}: UseResourceGroupDetailParams) {
  const queryClient = useQueryClient();

  const groupQuery = useQuery({
    queryKey: ["resource-access", "group", groupId],
    queryFn: () => permissionService.getGroup(groupId),
    enabled: groupId > 0,
  });

  const membersQuery = useQuery({
    queryKey: ["resource-access", "members", groupId, memberSearch, memberPage, memberPageSize],
    queryFn: () =>
      permissionService.getUserGroups({
        group: groupId,
        search: memberSearch || undefined,
        page: memberPage,
        page_size: memberPageSize,
      }),
    placeholderData: (prev) => prev,
    enabled: groupId > 0,
  });

  const addMember = useMutation({
    mutationFn: ({ user, group }: { user: number; group: number }) =>
      permissionService.createUserGroup({ user, group }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "members", groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "group", groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "groups"],
      });
    },
    onError: handleApiError,
  });

  const removeMember = useMutation({
    mutationFn: (id: number) => permissionService.deleteUserGroup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "members", groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "group", groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "groups"],
      });
    },
    onError: handleApiError,
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Group> }) =>
      permissionService.updateGroup(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "group", variables.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "groups"],
      });
    },
    onError: handleApiError,
  });

  return {
    group: groupQuery,
    members: membersQuery,
    addMember,
    removeMember,
    updateGroup,
  };
}
