import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { userService } from "@/services/userService";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import {
  useBulkUpdateCRUsers,
  useDeleteControlRoomAccess,
  useUpdateControlRoomAccess,
  useControlRoomAccessList,
} from "./useControlRoomAccess";
import type { ControlRoomAccess } from "../types";
import type { BulkAccessUpdate } from "../components/BulkControlRoomAccessDialog";

export const useControlRoomAccessPage = () => {
  const [searchParams] = useSearchParams();
  const deepLinkUserIdValue = searchParams.get("user_id");
  const parsedDeepLinkUserId = deepLinkUserIdValue ? Number(deepLinkUserIdValue) : NaN;
  const deepLinkUserId = Number.isInteger(parsedDeepLinkUserId) ? parsedDeepLinkUserId : null;

  const accessQuery = useControlRoomAccessList();
  const { data: accessList = [], isLoading } = accessQuery;
  const teamsQuery = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: () => userService.getTeams(),
    staleTime: 300_000,
  });
  const teams = teamsQuery.data?.results ?? [];

  const updateMutation = useUpdateControlRoomAccess();
  const deleteMutation = useDeleteControlRoomAccess();
  const bulkMutation = useBulkUpdateCRUsers();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [grantOpen, setGrantOpen] = useState(Boolean(deepLinkUserId));
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string>();
  const [editingAccess, setEditingAccess] = useState<ControlRoomAccess | null>(null);
  const [revokeAccess, setRevokeAccess] = useState<ControlRoomAccess | null>(null);

  const selectedAccesses = useMemo(
    () => accessList.filter((access) => rowSelection[String(access.id)]),
    [accessList, rowSelection]
  );
  const selectedUserIds = useMemo(
    () => selectedAccesses.map((access) => access.user),
    [selectedAccesses]
  );
  const existingUserIds = useMemo(() => accessList.map((access) => access.user), [accessList]);

  const handleToggleActive = (access: ControlRoomAccess) => {
    updateMutation.mutate({
      id: access.id,
      payload: { is_active: !access.is_active },
    });
  };

  const handleRevoke = () => {
    if (!revokeAccess) return;
    deleteMutation.mutate(revokeAccess.id, {
      onSuccess: () => {
        setRevokeAccess(null);
        setRowSelection((current) => {
          const next = { ...current };
          delete next[String(revokeAccess.id)];
          return next;
        });
      },
    });
  };

  const handleBulkUpdate = (update: BulkAccessUpdate) => {
    if (selectedUserIds.length === 0) return;
    setBulkError(undefined);
    bulkMutation.mutate(
      { user_ids: selectedUserIds, ...update },
      {
        onSuccess: (result) => {
          if (result.failed_ids.length > 0) {
            setBulkError(
              `${result.failed_ids.length} of ${result.total_requested} access records failed to update.`
            );
            return;
          }
          setBulkOpen(false);
          setRowSelection({});
        },
        onError: (error: unknown) =>
          setBulkError(extractApiErrorMessage(error, "Failed to update access records.")),
      }
    );
  };

  return {
    accessList,
    teams,
    isLoading,
    isError: accessQuery.isError,
    accessError: accessQuery.error,
    retryAccess: accessQuery.refetch,
    teamsError: teamsQuery.isError,
    retryTeams: teamsQuery.refetch,
    deepLinkUserId,
    existingUserIds,
    rowSelection,
    setRowSelection,
    grantOpen,
    setGrantOpen,
    createOpen,
    setCreateOpen,
    bulkOpen,
    setBulkOpen,
    bulkError,
    setBulkError,
    editingAccess,
    setEditingAccess,
    revokeAccess,
    setRevokeAccess,
    selectedAccesses,
    updateMutation,
    deleteMutation,
    bulkMutation,
    handleToggleActive,
    handleRevoke,
    handleBulkUpdate,
  };
};
