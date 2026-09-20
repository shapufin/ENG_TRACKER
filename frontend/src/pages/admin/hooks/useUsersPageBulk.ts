import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "@/services/userService";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { handleApiError, getBlockedRevocations } from "@/lib/error-handler";
import { toast } from "sonner";
import type { BlockedRevocation, TechAssignmentInput, UserProfile } from "@/types";
import type { RowSelectionState } from "@tanstack/react-table";

export interface BulkUserUpdatePayload {
  user_ids: number[];
  teams?: number[];
  techs?: TechAssignmentInput[];
  italian_tl?: number | null;
  albanian_tl?: number | null;
  is_hr?: boolean;
  is_italian_tl_role?: boolean;
  is_albanian_tl_role?: boolean;
}

interface UseUsersPageBulkOptions {
  filteredData: UserProfile[];
  rowSelection: RowSelectionState;
  onClearSelection: () => void;
  onCloseDrawer: () => void;
}

export const useUsersPageBulk = ({
  filteredData,
  rowSelection,
  onClearSelection,
  onCloseDrawer,
}: UseUsersPageBulkOptions) => {
  const queryClient = useQueryClient();

  const { bulkDeleteMutation } = useBulkOperations({
    queryKey: ["admin", "profiles"],
    onSuccess: () => {
      onClearSelection();
      onCloseDrawer();
    },
    entityName: "users",
    deleteFn: userService.bulkDeleteUsers,
  });

  const selectedProfiles = useMemo(() => {
    const selectedIds = new Set(Object.keys(rowSelection).map(Number));
    return filteredData.filter((profile) => selectedIds.has(profile.id));
  }, [filteredData, rowSelection]);

  const [bulkBlockedRevocations, setBulkBlockedRevocations] = useState<
    BlockedRevocation[] | null
  >(null);
  const [pendingBulkPayload, setPendingBulkPayload] = useState<Omit<
    BulkUserUpdatePayload,
    "user_ids"
  > | null>(null);

  const bulkUpdateMutation = useMutation({
    mutationFn: (payload: Omit<BulkUserUpdatePayload, "user_ids">) =>
      userService.bulkUpdateUsers({
        ...payload,
        user_ids: selectedProfiles.map((profile) => profile.user.id),
      }),
    onSuccess: (result) => {
      toast.success(`Updated ${result.updated_count} users`);
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      setBulkBlockedRevocations(null);
      setPendingBulkPayload(null);
      onClearSelection();
      onCloseDrawer();
    },
    onError: (error) => {
      const blocked = getBlockedRevocations(error);
      if (blocked) {
        setBulkBlockedRevocations(blocked);
        return;
      }
      handleApiError(error);
    },
  });

  const handleBulkUpdate = (payload: Omit<BulkUserUpdatePayload, "user_ids">) => {
    if (selectedProfiles.length === 0 || bulkUpdateMutation.isPending) return;
    setPendingBulkPayload(payload);
    bulkUpdateMutation.mutate(payload);
  };

  const retryBlockedBulkUpdate = () => {
    if (pendingBulkPayload) bulkUpdateMutation.mutate(pendingBulkPayload);
  };
  const closeBulkBlockedDialog = () => {
    setBulkBlockedRevocations(null);
    setPendingBulkPayload(null);
  };

  const handleBulkDelete = () => {
    if (selectedProfiles.length === 0 || bulkDeleteMutation.isPending) return;
    bulkDeleteMutation.mutate(selectedProfiles.map((profile) => profile.user.id));
  };

  return {
    selectedProfiles,
    bulkDeleteMutation,
    bulkUpdateMutation,
    handleBulkUpdate,
    handleBulkDelete,
    bulkBlockedRevocations,
    retryBlockedBulkUpdate,
    closeBulkBlockedDialog,
  };
};
