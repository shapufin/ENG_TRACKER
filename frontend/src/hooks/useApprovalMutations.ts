import { useMutation, useQueryClient } from "@tanstack/react-query";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { handleApiError } from "@/lib/error-handler";
import { toast } from "sonner";

type Tab = "overtime" | "standby" | "leave";

interface UseApprovalMutationsProps {
  invalidateVacationData: () => void;
  refetchMap: Record<Tab, () => void>;
}

/**
 * Custom hook for approval/reject mutations.
 * Centralizes mutation logic for all request types.
 *
 * Extracted from TLApprovalDashboard to reduce complexity.
 */
export const useApprovalMutations = ({
  invalidateVacationData,
  refetchMap,
}: UseApprovalMutationsProps) => {
  const qc = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async ({ type, id }: { type: Tab; id: number }) => {
      if (type === "overtime") return overtimeService.approve(id);
      if (type === "standby") return standbyService.approve(id);
      return leaveService.approve(id);
    },
    onSuccess: (_, { type }) => {
      toast.success("Approved successfully");
      refetchMap[type]();
      // Invalidate pending-months so card counts update in real-time
      qc.invalidateQueries({ queryKey: ["team", type, "pending-months"] });
      if (type === "leave") {
        invalidateVacationData();
      }
    },
    onError: (err) => handleApiError(err),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ type, id, reason }: { type: Tab; id: number; reason: string }) => {
      if (type === "overtime") return overtimeService.reject(id, reason);
      if (type === "standby") return standbyService.reject(id, reason);
      return leaveService.reject(id, reason);
    },
    onSuccess: (_, { type }) => {
      toast.success("Rejected successfully");
      refetchMap[type]();
      // Invalidate pending-months so card counts update in real-time
      qc.invalidateQueries({ queryKey: ["team", type, "pending-months"] });
      if (type === "leave") {
        invalidateVacationData();
      }
    },
    onError: (err) => handleApiError(err),
  });

  return { approveMutation, rejectMutation };
};
