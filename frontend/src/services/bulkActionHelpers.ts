import api from "@/lib/api";

export interface BulkApproveResponse {
  approved_count: number;
  failed_ids: number[];
  total_requested: number;
}

export const rejectEntity = async <T>(
  basePath: string,
  id: number,
  rejectionReason: string
): Promise<T> => {
  const { data } = await api.post<T>(`${basePath}/${id}/reject/`, {
    rejection_reason: rejectionReason,
  });
  return data;
};

export const bulkApproveEntities = async <T extends BulkApproveResponse>(
  basePath: string,
  ids: number[]
): Promise<T> => {
  const { data } = await api.post<T>(`${basePath}/bulk_approve/`, { ids });
  return data;
};
