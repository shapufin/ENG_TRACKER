import { useQuery } from "@tanstack/react-query";
import { permissionService } from "@/services/permissionService";

export interface UseMemberCandidatesParams {
  groupId: number;
  search: string;
  page: number;
  pageSize: number;
  enabled?: boolean;
}

export function useMemberCandidates({
  groupId,
  search,
  page,
  pageSize,
  enabled = true,
}: UseMemberCandidatesParams) {
  return useQuery({
    queryKey: ["resource-access", "user-search", groupId, search, page, pageSize],
    queryFn: () =>
      permissionService.getMemberCandidates(groupId, {
        search: search || undefined,
        page,
        page_size: pageSize,
      }),
    enabled: enabled && groupId > 0 && search.length > 0,
    placeholderData: (prev) => prev,
  });
}
