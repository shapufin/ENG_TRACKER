import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  ClientExport,
  ClientOnboardingLifecycleInfo,
  Document,
  Folder,
  OfficeEditorConfigResponse,
  OnboardingClient,
  SearchResults,
} from "../types/onboarding";

const BASE = "/plugins/onboarding";

export const onboardingService = {
  async getClients(): Promise<OnboardingClient[]> {
    const { data } = await api.get<OnboardingClient[] | PaginatedResponse<OnboardingClient>>(
      `${BASE}/clients/`
    );
    return normalizeList(data);
  },

  async getFolders(clientId: number, parentId: number | null): Promise<Folder[]> {
    const { data } = await api.get<Folder[] | PaginatedResponse<Folder>>(`${BASE}/folders/`, {
      params: { client_id: clientId, parent_id: parentId ?? "" },
    });
    return normalizeList(data);
  },

  async getDocuments(clientId: number, folderId: number | null): Promise<Document[]> {
    const { data } = await api.get<Document[] | PaginatedResponse<Document>>(`${BASE}/documents/`, {
      params: { client_id: clientId, folder_id: folderId ?? "" },
    });
    return normalizeList(data);
  },

  createFolder: (data: { client: number; parent: number | null; name: string }) =>
    api.post<Folder>(`${BASE}/folders/`, data),

  renameFolder: (id: number, name: string) => api.patch<Folder>(`${BASE}/folders/${id}/`, { name }),

  deleteFolder: (id: number) => api.delete(`${BASE}/folders/${id}/`),

  moveFolder: (id: number, parentId: number | null) =>
    api.post<Folder>(`${BASE}/folders/${id}/move/`, { parent_id: parentId }),

  uploadDocument: (data: { client: number; folder: number | null; file: File }) => {
    const form = new FormData();
    form.append("client", String(data.client));
    if (data.folder !== null) form.append("folder", String(data.folder));
    form.append("file", data.file);
    return api.post<Document>(`${BASE}/documents/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  renameDocument: (id: number, name: string) =>
    api.patch<Document>(`${BASE}/documents/${id}/`, { name }),

  deleteDocument: (id: number) => api.delete(`${BASE}/documents/${id}/`),

  moveDocument: (id: number, folderId: number | null) =>
    api.post<Document>(`${BASE}/documents/${id}/move/`, { folder_id: folderId }),

  async search(clientId: number, query: string): Promise<SearchResults> {
    const { data } = await api.get<SearchResults>(`${BASE}/folders/search/`, {
      params: { client_id: clientId, q: query },
    });
    return data;
  },

  /** Download a document as a blob (authenticated) — a raw <a href> would
   * miss the auth header, same reason ticket_kpi's evidence download works
   * this way. */
  async downloadDocument(id: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`${BASE}/documents/${id}/download/`, {
      responseType: "blob",
    });
    return data;
  },

  /** Archived clients (superuser only; the default list is active clients). */
  async getArchivedClients(): Promise<OnboardingClient[]> {
    const { data } = await api.get<OnboardingClient[] | PaginatedResponse<OnboardingClient>>(
      `${BASE}/clients/`,
      { params: { archived: "true" } }
    );
    return normalizeList(data);
  },

  /** Queue a ZIP of one client's onboarding data (built by the scheduler). */
  async createClientExport(clientId: number): Promise<ClientExport> {
    const { data } = await api.post<ClientExport>(`${BASE}/clients/${clientId}/exports/`);
    return data;
  },

  /** Every client, archived ones included (superuser only). */
  async createAllClientsExport(): Promise<ClientExport> {
    const { data } = await api.post<ClientExport>(`${BASE}/exports/all/`);
    return data;
  },

  async getExport(id: number): Promise<ClientExport> {
    const { data } = await api.get<ClientExport>(`${BASE}/exports/${id}/`);
    return data;
  },

  /** A 120-second, single-use URL: navigate to it, never fetch it as a blob. */
  async getExportDownloadUrl(id: number): Promise<string> {
    const { data } = await api.post<{ url: string }>(`${BASE}/exports/${id}/download-link/`);
    return data.url;
  },

  async getClientLifecycle(clientId: number): Promise<ClientOnboardingLifecycleInfo> {
    const { data } = await api.get<ClientOnboardingLifecycleInfo>(
      `${BASE}/clients/${clientId}/lifecycle/`
    );
    return data;
  },

  async purgeClientOnboarding(
    clientId: number,
    confirmCode: string
  ): Promise<{ folders: number; documents: number }> {
    const { data } = await api.post<{ folders: number; documents: number }>(
      `${BASE}/clients/${clientId}/purge/`,
      { confirm_code: confirmCode }
    );
    return data;
  },

  async getOfficeEditorConfig(id: number): Promise<OfficeEditorConfigResponse> {
    const { data } = await api.get<OfficeEditorConfigResponse>(
      `${BASE}/documents/${id}/editor-config/`
    );
    return data;
  },
};
