import { useState } from "react";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { toast } from "sonner";
import type { UseMutateFunction } from "@tanstack/react-query";

interface BulkMutationSet {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approve: { mutate: UseMutateFunction<any, any, any, any>; isPending: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: { mutate: UseMutateFunction<any, any, any, any>; isPending: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete?: { mutate: UseMutateFunction<any, any, any, any>; isPending: boolean };
}

export const useTeamBulkActions = (
  activeTab: "overtime" | "standby" | "leave",
  onClear: () => void
) => {
  const ot = useBulkOperations({
    queryKey: ["team", "overtime"],
    entityName: "entries",
    onSuccess: onClear,
    approveFn: overtimeService.bulkApprove,
    rejectFn: overtimeService.bulkReject,
    deleteFn: overtimeService.bulkDelete,
  });
  const sb = useBulkOperations({
    queryKey: ["team", "standby"],
    entityName: "entries",
    onSuccess: onClear,
    approveFn: standbyService.bulkApprove,
    rejectFn: standbyService.bulkReject,
    deleteFn: standbyService.bulkDelete,
  });
  const leave = useBulkOperations({
    queryKey: ["team", "leave"],
    entityName: "requests",
    onSuccess: onClear,
    approveFn: leaveService.bulkApprove,
    rejectFn: leaveService.bulkReject,
  });

  const [confirmAction, setConfirmAction] = useState<{
    open: boolean;
    action: "approve" | "reject" | "delete";
    count: number;
  } | null>(null);

  const mutations: Record<string, BulkMutationSet> = {
    overtime: {
      approve: ot.bulkApproveMutation,
      reject: ot.bulkRejectMutation,
      delete: ot.bulkDeleteMutation,
    },
    standby: {
      approve: sb.bulkApproveMutation,
      reject: sb.bulkRejectMutation,
      delete: sb.bulkDeleteMutation,
    },
    leave: { approve: leave.bulkApproveMutation, reject: leave.bulkRejectMutation },
  };

  const handleBulkAction = (action: "approve" | "reject" | "delete", selectedCount: number) => {
    if (selectedCount === 0) return;
    if (action === "delete" && activeTab === "leave") {
      toast.error("Bulk delete not available for leave requests");
      return;
    }
    setConfirmAction({ open: true, action, count: selectedCount });
  };

  // fallow-ignore-next-line complexity
  const confirmBulkAction = (selectedIds: number[]) => {
    if (!confirmAction) return;
    const ids = selectedIds;
    const set = mutations[activeTab];
    const action = confirmAction.action;
    if (action === "approve") set.approve.mutate(ids);
    else if (action === "reject") set.reject.mutate({ ids, reason: "Rejected by team leader" });
    else if (action === "delete" && set.delete) set.delete.mutate(ids);
    setConfirmAction(null);
  };

  const isApproving = ot.bulkApproveMutation.isPending || sb.bulkApproveMutation.isPending;
  const isRejecting = ot.bulkRejectMutation.isPending || sb.bulkRejectMutation.isPending;
  const isDeleting = ot.bulkDeleteMutation.isPending || sb.bulkDeleteMutation.isPending;

  return {
    confirmAction,
    setConfirmAction,
    handleBulkAction,
    confirmBulkAction,
    isApproving,
    isRejecting,
    isDeleting,
  };
};
