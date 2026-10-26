import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type { YearSnapshot, YearSnapshotFile } from "../types/yearClose";

const BASE = "/plugins/year_close";

export const yearCloseService = {
  /** Every snapshot, newest year first (superuser only). */
  async listSnapshots(): Promise<YearSnapshot[]> {
    const { data } = await api.get<YearSnapshot[] | PaginatedResponse<YearSnapshot>>(
      `${BASE}/snapshots/`
    );
    return normalizeList(data);
  },

  async listFiles(snapshotId: number): Promise<YearSnapshotFile[]> {
    const { data } = await api.get<YearSnapshotFile[] | PaginatedResponse<YearSnapshotFile>>(
      `${BASE}/snapshots/${snapshotId}/files/`
    );
    return normalizeList(data);
  },

  /** A 120-second, single-use URL: navigate to it, never fetch it as a blob. */
  async getDownloadUrl(fileId: number): Promise<string> {
    const { data } = await api.post<{ url: string }>(`${BASE}/files/${fileId}/download-link/`);
    return data.url;
  },
};
