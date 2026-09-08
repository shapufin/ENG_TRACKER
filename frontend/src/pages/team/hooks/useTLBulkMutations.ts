import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { handleApiError } from "@/lib/error-handler";

type Tab = "overtime" | "standby" | "leave";

interface BulkOperationResponse {
  approved_count?: number;
  rejected_count?: number;
  deleted_count?: number;
  failed_ids: number[];
  total_requested: number;
}

interface UseTLBulkMutationsOptions {
  dateFrom: string;
  dateTo: string;
  invalidateVacationData: () => void;
}

export const useTLBulkMutations = ({
  dateFrom,
  dateTo,
  invalidateVacationData,
}: UseTLBulkMutationsOptions) => {
  const qc = useQueryClient();

  const bulkApproveMutation = useMutation({
    mutationFn: async ({ type, ids }: { type: Tab; ids: number[] }) => {
      if (type === "overtime") return overtimeService.bulkApprove(ids);
      if (type === "standby") return standbyService.bulkApprove(ids);
      return leaveService.bulkApprove(ids);
    },
    // fallow-ignore-next-line complexity
    onSuccess: (response: BulkOperationResponse, { type, ids }) => {
      const approved = response.approved_count || 0;
      const failed = response.failed_ids?.length || 0;
      if (failed > 0) {
        toast.warning(
          `Approved ${approved} of ${ids.length} ${type} request${ids.length > 1 ? "s" : ""}. ${failed} failed.`
        );
      } else {
        toast.success(`Approved ${approved} ${type} request${approved > 1 ? "s" : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["team", type, "pending", dateFrom, dateTo] });
      qc.invalidateQueries({ queryKey: ["team", type, "pending-months"] });
      if (type === "leave") invalidateVacationData();
    },
    onError: (err) => handleApiError(err),
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ type, ids, reason }: { type: Tab; ids: number[]; reason: string }) => {
      if (type === "overtime") return overtimeService.bulkReject(ids, reason);
      if (type === "standby") return standbyService.bulkReject(ids, reason);
      return leaveService.bulkReject(ids, reason);
    },
    // fallow-ignore-next-line complexity
    onSuccess: (response: BulkOperationResponse, { type, ids }) => {
      const rejected = response.rejected_count || 0;
      const failed = response.failed_ids?.length || 0;
      if (failed > 0) {
        toast.warning(
          `Rejected ${rejected} of ${ids.length} ${type} request${ids.length > 1 ? "s" : ""}. ${failed} failed.`
        );
      } else {
        toast.success(`Rejected ${rejected} ${type} request${rejected > 1 ? "s" : ""}`);
      }
      qc.invalidateQueries({ queryKey: ["team", type, "pending", dateFrom, dateTo] });
      qc.invalidateQueries({ queryKey: ["team", type, "pending-months"] });
      if (type === "leave") invalidateVacationData();
    },
    onError: (err) => handleApiError(err),
  });

  return { bulkApproveMutation, bulkRejectMutation };
};
