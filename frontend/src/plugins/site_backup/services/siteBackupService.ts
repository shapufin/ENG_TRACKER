import api from "@/lib/api";
import { downloadBlobResponse } from "@/lib/download";
import type {
  ArchiveSource,
  BackupRecord,
  RestoreCommitResult,
  RestorePreviewResult,
} from "../types/siteBackup";

const BASE = "/plugins/site_backup";

/** Build the request body for an archive-source endpoint (preview/commit). */
const archiveSourcePayload = (source: ArchiveSource, extra: Record<string, unknown> = {}) => {
  if ("file" in source) {
    const formData = new FormData();
    formData.append("file", source.file);
    Object.entries(extra).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => formData.append(key, String(item)));
      } else if (value !== undefined) {
        formData.append(key, String(value));
      }
    });
    return { data: formData, headers: { "Content-Type": "multipart/form-data" } };
  }
  return { data: { backup_id: source.backupId, ...extra }, headers: undefined };
};

export const siteBackupService = {
  async listBackups(): Promise<BackupRecord[]> {
    const { data } = await api.get(`${BASE}/backups/`);
    return Array.isArray(data) ? data : (data.results ?? []);
  },

  async createBackup(note: string, includeMedia: boolean): Promise<BackupRecord> {
    const { data } = await api.post(`${BASE}/backups/`, { note, include_media: includeMedia });
    return data;
  },

  async deleteBackup(id: number): Promise<void> {
    await api.delete(`${BASE}/backups/${id}/`);
  },

  async downloadBackup(record: BackupRecord): Promise<void> {
    const { data } = await api.get(`${BASE}/backups/${record.id}/download/`, {
      responseType: "blob",
    });
    downloadBlobResponse(data, record.filename);
  },

  async previewRestore(source: ArchiveSource): Promise<RestorePreviewResult> {
    const { data: body, headers } = archiveSourcePayload(source);
    const { data } = await api.post(`${BASE}/restore/preview/`, body, { headers });
    return data;
  },

  async commitRestore(
    source: ArchiveSource,
    options: {
      approvedModels: string[];
      deleteMissingModels?: string[];
      restoreMedia?: boolean;
      confirmed: boolean;
    }
  ): Promise<RestoreCommitResult> {
    const { data: body, headers } = archiveSourcePayload(source, {
      approved_models: options.approvedModels,
      delete_missing_models: options.deleteMissingModels ?? [],
      restore_media: options.restoreMedia ?? false,
      confirmed: options.confirmed,
    });
    const { data } = await api.post(`${BASE}/restore/commit/`, body, { headers });
    return data;
  },
};
