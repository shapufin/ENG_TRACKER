import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface BulkApproveResult {
  approved_count: number;
  [key: string]: unknown;
}
interface BulkRejectResult {
  rejected_count: number;
  [key: string]: unknown;
}
interface BulkDeleteResult {
  deleted_count: number;
  failed_users?: Array<{ id: number; reason: string }>;
  total_requested: number;
}

interface BulkOperationOptions {
  queryKey: unknown[];
  onSuccess?: (res: unknown) => void;
  entityName?: string;
  approveFn?: (ids: number[]) => Promise<BulkApproveResult>;
  rejectFn?: (ids: number[], reason: string) => Promise<BulkRejectResult>;
  deleteFn?: (ids: number[]) => Promise<BulkDeleteResult>;
}

export const useBulkOperations = ({
  queryKey,
  onSuccess,
  entityName = "entries",
  approveFn,
  rejectFn,
  deleteFn,
}: BulkOperationOptions) => {
  const qc = useQueryClient();

  const handleSuccess = (message: string, res: unknown) => {
    qc.refetchQueries({ queryKey });
    toast.success(message);
    if (onSuccess) onSuccess(res);
  };

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: number[]) =>
      approveFn ? approveFn(ids) : Promise.reject(new Error("approveFn not configured")),
    onSuccess: (res) => handleSuccess(`Approved ${res.approved_count} ${entityName}`, res),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      rejectFn ? rejectFn(ids, reason) : Promise.reject(new Error("rejectFn not configured")),
    onSuccess: (res) => handleSuccess(`Rejected ${res.rejected_count} ${entityName}`, res),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      deleteFn ? deleteFn(ids) : Promise.reject(new Error("deleteFn not configured")),
    onSuccess: (res: BulkDeleteResult) => {
      qc.refetchQueries({ queryKey });

      if (res.failed_users && res.failed_users.length > 0) {
        const failedCount = res.failed_users.length;
        const deletedCount = res.deleted_count;
        const reasons = res.failed_users.map((f) => `ID ${f.id}: ${f.reason}`).join("; ");
        toast.warning(`Deleted ${deletedCount} ${entityName}, ${failedCount} failed (${reasons})`);
      } else {
        toast.success(`Deleted ${res.deleted_count} ${entityName}`);
      }

      if (onSuccess) onSuccess(res);
    },
  });

  return { bulkApproveMutation, bulkRejectMutation, bulkDeleteMutation };
};
