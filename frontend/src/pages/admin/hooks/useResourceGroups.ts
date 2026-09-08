import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/error-handler";
import { permissionService } from "@/services/permissionService";
import type { Group } from "@/types";

export interface UseResourceGroupsParams {
  search: string;
  page: number;
  pageSize: number;
}

export function useResourceGroups({ search, page, pageSize }: UseResourceGroupsParams) {
  const queryClient = useQueryClient();

  const groupsQuery = useQuery({
    queryKey: ["resource-access", "groups", search, page, pageSize],
    queryFn: () =>
      permissionService.getGroups({
        search: search || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const createGroup = useMutation({
    mutationFn: (payload: { name: string; code: string; description?: string }) =>
      permissionService.createGroup(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource-access", "groups"] });
    },
    onError: handleApiError,
  });

  const updateGroup = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Group> }) =>
      permissionService.updateGroup(id, payload),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["resource-access", "groups"] });
      void queryClient.invalidateQueries({
        queryKey: ["resource-access", "group", variables.id],
      });
    },
    onError: handleApiError,
  });

  const bulkDeleteGroups = useMutation({
    mutationFn: (ids: number[]) => permissionService.bulkDeleteGroups(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["resource-access", "groups"] });
      void queryClient.invalidateQueries({ queryKey: ["resource-access", "members"] });
      void queryClient.invalidateQueries({ queryKey: ["resource-access", "group"] });
      void queryClient.invalidateQueries({ queryKey: ["plugin-permissions"] });
    },
    onError: handleApiError,
  });

  return {
    groups: groupsQuery,
    createGroup,
    updateGroup,
    bulkDeleteGroups,
  };
}
