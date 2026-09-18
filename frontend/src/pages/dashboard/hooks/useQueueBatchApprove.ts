import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";

interface QueueBatchApproveHighlight {
  id: number;
  type: string;
  status: string;
}

interface UseQueueBatchApproveProps {
  highlights: QueueBatchApproveHighlight[];
}

const SERVICE_BY_TYPE: Record<string, { bulkApprove: (ids: number[]) => Promise<{
  approved_count: number;
  failed_ids: number[];
  total_requested: number;
}> }> = {
  overtime: overtimeService,
  standby: standbyService,
  leave: leaveService,
};

export const useQueueBatchApprove = ({ highlights }: UseQueueBatchApproveProps) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const idsByType: Record<string, number[]> = { overtime: [], standby: [], leave: [] };
      for (const item of highlights) {
        if (item.status === "pending" && idsByType[item.type]) {
          idsByType[item.type].push(item.id);
        }
      }

      const results = await Promise.all(
        Object.entries(idsByType)
          .filter(([, ids]) => ids.length > 0)
          .map(([type, ids]) => SERVICE_BY_TYPE[type].bulkApprove(ids))
      );

      return results.reduce(
        (acc, result) => ({
          approved_count: acc.approved_count + result.approved_count,
          failed_ids: [...acc.failed_ids, ...result.failed_ids],
          total_requested: acc.total_requested + result.total_requested,
        }),
        { approved_count: 0, failed_ids: [] as number[], total_requested: 0 }
      );
    },
    onSuccess: (result) => {
      if (result.failed_ids.length > 0) {
        toast.warning(
          `Approved ${result.approved_count} of ${result.total_requested}. ${result.failed_ids.length} item(s) could not be approved.`
        );
      } else {
        toast.success(`Approved ${result.approved_count} item(s).`);
      }
    },
    onError: () => {
      toast.error("Batch approve failed.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return {
    batchApprove: mutation.mutate,
    isBatchApproving: mutation.isPending,
  };
};
