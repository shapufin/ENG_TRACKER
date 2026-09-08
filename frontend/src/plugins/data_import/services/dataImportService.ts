import api from "@/lib/api";
import type {
  AnalyzeResult,
  CommitResult,
  ImportBatch,
  ImportOptions,
  ImportProfile,
  ImportTarget,
  PreviewResult,
} from "../types/dataImport";

const BASE = "/plugins/data_import";

export const dataImportService = {
  async getTargets(): Promise<{ targets: ImportTarget[] }> {
    const { data } = await api.get(`${BASE}/targets/`);
    return data;
  },

  async analyze(file: File, targetKey: string): Promise<AnalyzeResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_key", targetKey);
    const { data } = await api.post(`${BASE}/import/analyze/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async preview(
    file: File,
    targetKey: string,
    fieldMapping: Record<string, string | null>,
    defaultValues: Record<string, unknown>,
    options: ImportOptions
  ): Promise<PreviewResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("target_key", targetKey);
    formData.append("field_mapping", JSON.stringify(stripNulls(fieldMapping)));
    formData.append("default_values", JSON.stringify(defaultValues));
    formData.append("options", JSON.stringify(options));
    const { data } = await api.post(`${BASE}/import/preview/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  async commit(
    file: File,
    targetKey: string,
    fieldMapping: Record<string, string | null>,
    defaultValues: Record<string, unknown>,
    options: ImportOptions,
    saveProfile?: { name: string }
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
    const { data } = await api.post(`${BASE}/import/commit/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
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
