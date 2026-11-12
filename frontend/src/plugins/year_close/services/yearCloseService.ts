import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  ArchiveEntry,
  LeaderHistoryRow,
  PurgeResult,
  VerifyResult,
  YearSnapshot,
} from "../types/yearClose";

const BASE = "/plugins/year_close";

export const yearCloseService = {
  /** Every snapshot, newest year first (superuser only). */
  async listSnapshots(): Promise<YearSnapshot[]> {
    const { data } = await api.get<YearSnapshot[] | PaginatedResponse<YearSnapshot>>(
      `${BASE}/snapshots/`
    );
    return normalizeList(data);
  },

  /** A 120-second, single-use URL: navigate to it, never fetch it as a blob. */
  async getDownloadUrl(fileId: number): Promise<string> {
    const { data } = await api.post<{ url: string }>(`${BASE}/files/${fileId}/download-link/`);
    return data.url;
  },

  /** One entry per closed year: categories with counts and removal dates, plus files. */
  async listArchives(): Promise<ArchiveEntry[]> {
    const { data } = await api.get<ArchiveEntry[]>(`${BASE}/archives/`);
    return data;
  },

  /** Recomputes the file's checksum on the server and compares it with the stored one. */
  async verifyFile(fileId: number): Promise<VerifyResult> {
    const { data } = await api.post<{ result: VerifyResult }>(`${BASE}/files/${fileId}/verify/`);
    return data.result;
  },

  async listLeaderHistory(year: number): Promise<LeaderHistoryRow[]> {
    const { data } = await api.get<LeaderHistoryRow[]>(`${BASE}/archives/leaders/`, {
      params: { year },
    });
    return data;
  },

  /** Preview (dryRun) or confirm the removal of one archived category. 409 carries `reasons`. */
  async purgeCategory(year: number, category: string, dryRun: boolean): Promise<PurgeResult> {
    const { data } = await api.post<PurgeResult>(`${BASE}/archives/purge/`, {
      year,
      category,
      dry_run: dryRun,
    });
    return data;
  },

  /** A leader's workbook for one year; small enough to stream as a blob. */
  async exportLeader(year: number, leaderId: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/archives/leaders/export/`, {
      params: { year, leader: leaderId },
      responseType: "blob",
    });
    return data;
  },
};
