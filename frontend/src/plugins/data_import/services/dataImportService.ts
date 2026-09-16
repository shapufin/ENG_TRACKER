import api from "@/lib/api";
import { downloadBlobResponse } from "@/lib/download";
import type { AxiosProgressEvent } from "axios";
import type {
  TemplateFormat,
  AnalyzeResult,
  CommitResult,
  ImportBatch,
  ImportOptions,
  ImportProfile,
  ImportTarget,
  PreviewResult,
} from "../types/dataImport";

const BASE = "/plugins/data_import";

/** Upload/processing can far outlast the global 10s axios default. */
const IMPORT_TIMEOUT_MS = 120_000;

type UploadProgressHandler = (percent: number) => void;

/** Shared config for the heavy multipart endpoints: longer timeout + upload progress. */
const uploadConfig = (onProgress?: UploadProgressHandler) => ({
  headers: { "Content-Type": "multipart/form-data" },
  timeout: IMPORT_TIMEOUT_MS,
  onUploadProgress: (event: AxiosProgressEvent) => {
    if (onProgress && event.total) {
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    }
  },
});

export const dataImportService = {
  async getTargets(): Promise<{ targets: ImportTarget[] }> {
    const { data } = await api.get(`${BASE}/targets/`);
    return data;
  },

  /**
   * Download the schema-generated sample file for one target.
   *
   * The query parameter is `file_format`, not `format`: DRF reserves `format`
   * for renderer negotiation and answers 404 for an unknown value.
   */
  async downloadTemplate(targetKey: string, fileFormat: TemplateFormat): Promise<void> {
    const { data } = await api.get(`${BASE}/targets/${targetKey}/template/`, {
      params: { file_format: fileFormat },
      responseType: "blob",
    });
    downloadBlobResponse(data, `${targetKey}_import_template.${fileFormat}`);
  },

  async analyze(file: File, targetKey: string, onUploadProgress?: UploadProgressHandler): Promise<AnalyzeResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_key", targetKey);
    const { data } = await api.post(`${BASE}/import/analyze/`, formData, uploadConfig(onUploadProgress));
    return data;
  },

  async preview(
    file: File,
    targetKey: string,
    fieldMapping: Record<string, string | null>,
    defaultValues: Record<string, unknown>,
    options: ImportOptions,
    onUploadProgress?: UploadProgressHandler
  ): Promise<PreviewResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_key", targetKey);
    formData.append("field_mapping", JSON.stringify(stripNulls(fieldMapping)));
    formData.append("default_values", JSON.stringify(defaultValues));
    formData.append("options", JSON.stringify(options));
    const { data } = await api.post(`${BASE}/import/preview/`, formData, uploadConfig(onUploadProgress));
    return data;
  },

  async commit(
    file: File,
    targetKey: string,
    fieldMapping: Record<string, string | null>,
    defaultValues: Record<string, unknown>,
    options: ImportOptions,
    saveProfile?: { name: string },
    onUploadProgress?: UploadProgressHandler
  ): Promise<CommitResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_key", targetKey);
    formData.append("field_mapping", JSON.stringify(stripNulls(fieldMapping)));
    formData.append("default_values", JSON.stringify(defaultValues));
    formData.append("options", JSON.stringify(options));
    if (saveProfile) {
      formData.append("save_profile", "true");
      formData.append("profile_name", saveProfile.name);
    }
    const { data } = await api.post(`${BASE}/import/commit/`, formData, uploadConfig(onUploadProgress));
    return data;
  },

  async listProfiles(targetKey: string): Promise<ImportProfile[]> {
    const { data } = await api.get(`${BASE}/profiles/`, { params: { target_key: targetKey } });
    return data;
  },

  async createProfile(
    payload: Omit<ImportProfile, "id" | "created_at" | "updated_at">
  ): Promise<ImportProfile> {
    const { data } = await api.post(`${BASE}/profiles/`, payload);
    return data;
  },

  async updateProfile(id: number, payload: Partial<ImportProfile>): Promise<ImportProfile> {
    const { data } = await api.put(`${BASE}/profiles/${id}/`, payload);
    return data;
  },

  async deleteProfile(id: number): Promise<void> {
    await api.delete(`${BASE}/profiles/${id}/`);
  },

  async listBatches(targetKey?: string): Promise<ImportBatch[]> {
    const { data } = await api.get(`${BASE}/import/batches/`, {
      params: targetKey ? { target_key: targetKey } : {},
    });
    return data;
  },
};

function stripNulls(mapping: Record<string, string | null>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value !== null && value !== undefined && value !== "") {
      result[key] = value;
    }
  }
  return result;
}
