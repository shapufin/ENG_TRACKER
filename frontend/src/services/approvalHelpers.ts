// fallow-ignore-file unused-file
import api from "@/lib/api";

export interface BulkApproveResult {
  approved_count: number;
  failed_ids: number[];
  total_requested: number;
}

export async function rejectRecord<T>(
  basePath: string,
  id: number,
  rejectionReason: string
): Promise<T> {
  const { data } = await api.post<T>(`${basePath}/${id}/reject/`, {
    rejection_reason: rejectionReason,
  });
  return data;
}

export async function bulkApproveRecords(
  basePath: string,
  ids: number[]
): Promise<BulkApproveResult> {
  const { data } = await api.post<BulkApproveResult>(`${basePath}/bulk_approve/`, { ids });
  return data;
}
