import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import type { PaginatedResponse } from "@/types";
import type {
  ExportProfile,
  TicketImportBatch,
  UploadPreview,
  AnalyzeResponse,
  MonthlyKPI,
  YearlyReport,
  KPIEvidence,
  TicketListResponse,
  TicketQueryFilters,
  TicketSearchResult,
  TicketOvertimeLink,
} from "../types/ticketKPI";

type TicketQueryParams = {
  month?: string;
  year?: number;
  user_id?: number;
  page?: number;
  page_size?: number;
  filters?: TicketQueryFilters;
};

const addDefinedParam = (
  query: Record<string, string>,
  key: string,
  value: string | number | undefined
) => {
  if (value !== undefined && value !== "") query[key] = String(value);
};

const addTicketPeriodParams = (
  query: Record<string, string>,
  { month, year, user_id, page, page_size }: TicketQueryParams
) => {
  addDefinedParam(query, "month", month);
  addDefinedParam(query, "year", year);
  addDefinedParam(query, "user_id", user_id);
  addDefinedParam(query, "page", page);
  addDefinedParam(query, "page_size", page_size);
};

const addTicketFilterParams = (
  query: Record<string, string>,
  filters: TicketQueryFilters | undefined
) => {
  if (!filters) return;
  for (const key of [
    "status",
    "priority",
    "category",
    "assignee",
    "requester",
    "search",
  ] as const) {
    addDefinedParam(query, key, filters[key]);
  }
  if (filters.sla_breached !== undefined) {
    query.sla_breached = String(filters.sla_breached);
  }
  for (const [field, value] of Object.entries(filters.dynamicFields ?? {})) {
    addDefinedParam(query, `field_${field}`, value);
  }
};

const buildTicketQueryParams = (params: TicketQueryParams): Record<string, string> => {
  const query: Record<string, string> = {};
  addTicketPeriodParams(query, params);
  addTicketFilterParams(query, params.filters);
  return query;
};

export const ticketKPIService = {
  // Admin: Export Profiles
  async getProfiles(): Promise<ExportProfile[]> {
    const { data } = await api.get<ExportProfile[] | PaginatedResponse<ExportProfile>>(
      "/plugins/ticket_kpi/profiles/"
    );
    return normalizeList(data);
  },
  createProfile: (data: Partial<ExportProfile>) =>
    api.post<ExportProfile>("/plugins/ticket_kpi/profiles/", data),
  updateProfile: (id: number, data: Partial<ExportProfile>) =>
    api.patch<ExportProfile>(`/plugins/ticket_kpi/profiles/${id}/`, data),
  deleteProfile: (id: number) => api.delete(`/plugins/ticket_kpi/profiles/${id}/`),
  testMapping: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<UploadPreview>(`/plugins/ticket_kpi/profiles/${id}/test_mapping/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  autoDetect: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<AnalyzeResponse>("/plugins/ticket_kpi/profiles/auto_detect/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // User: Upload
  analyzeFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<AnalyzeResponse>("/plugins/ticket_kpi/upload/analyze/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  previewUpload: (file: File, profileId: number, month: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("profile_id", String(profileId));
    form.append("month", month);
    return api.post<UploadPreview>("/plugins/ticket_kpi/upload/preview/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  commitUpload: (
    file: File,
    profileId: number,
    month: string,
    override: boolean,
    clientIds?: number[]
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("profile_id", String(profileId));
    form.append("month", month);
    form.append("override", String(override));
    if (clientIds && clientIds.length > 0) {
      form.append("client_ids", clientIds.join(","));
    }
    return api.post<{
      batch_id: number;
      record_count: number;
      month: string;
      parse_errors: string[];
    }>("/plugins/ticket_kpi/upload/import_batch/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  async getMyBatches(): Promise<TicketImportBatch[]> {
    const { data } = await api.get<TicketImportBatch[] | PaginatedResponse<TicketImportBatch>>(
      "/plugins/ticket_kpi/upload/my_batches/"
    );
    return normalizeList(data);
  },
  async getTeamBatches(month?: string): Promise<TicketImportBatch[]> {
    const { data } = await api.get<TicketImportBatch[] | PaginatedResponse<TicketImportBatch>>(
      "/plugins/ticket_kpi/upload/team_batches/",
      { params: month ? { month } : undefined }
    );
    return normalizeList(data);
  },
  deleteBatch: (id: number) => api.delete(`/plugins/ticket_kpi/upload/${id}/delete_batch/`),
  deleteTeamBatch: (id: number) =>
    api.delete(`/plugins/ticket_kpi/upload/${id}/delete_team_batch/`),

  // Dashboard
  getMonthlySummary: (month: string, userId?: number, compareMonth?: string) =>
    api.get<MonthlyKPI>("/plugins/ticket_kpi/dashboard/monthly_summary/", {
      params: {
        month,
        ...(userId ? { user_id: userId } : {}),
        ...(compareMonth ? { compare_month: compareMonth } : {}),
      },
    }),
  async getTrend(months: number = 12, userId?: number): Promise<MonthlyKPI[]> {
    const { data } = await api.get<MonthlyKPI[] | PaginatedResponse<MonthlyKPI>>(
      "/plugins/ticket_kpi/dashboard/trend/",
      {
        params: { months, ...(userId ? { user_id: userId } : {}) },
      }
    );
    return normalizeList(data);
  },
  getCategories: (month: string, userId?: number) =>
    api.get<{
      month: string;
      by_category: Record<string, number>;
      by_priority: Record<string, number>;
    }>("/plugins/ticket_kpi/dashboard/categories/", {
      params: { month, ...(userId ? { user_id: userId } : {}) },
    }),

  // Team (TL)
  getTeamSummary: (month: string) =>
    api.get<{
      month: string;
      members_with_data: number;
      total_tickets: number;
      avg_tickets_per_member: number;
      avg_resolution_hours?: number;
      sla_compliance_pct?: number;
      members: Array<{
        user_id: number;
        username: string;
        name: string;
        total_tickets: number;
        closed_tickets?: number;
        open_tickets?: number;
        avg_resolution_hours?: number;
        sla_compliance_pct?: number;
        sla_breached_count?: number;
        fields_populated?: string[];
        field_breakdowns?: Record<string, Record<string, number>>;
      }>;
    }>("/plugins/ticket_kpi/dashboard/team_summary/", { params: { month } }),
  async getTeamTrend(
    months: number = 6,
    month?: string
  ): Promise<
    Array<{
      month: string;
      total_tickets: number;
      avg_resolution_hours?: number;
      sla_compliance_pct?: number;
    }>
  > {
    const { data } = await api.get<
      | Array<{
          month: string;
          total_tickets: number;
          avg_resolution_hours?: number;
          sla_compliance_pct?: number;
        }>
      | PaginatedResponse<{
          month: string;
          total_tickets: number;
          avg_resolution_hours?: number;
          sla_compliance_pct?: number;
        }>
    >("/plugins/ticket_kpi/dashboard/team_trend/", {
      params: { months, ...(month ? { month } : {}) },
    });
    return normalizeList(data);
  },
  getTeamYearlySummary: (year: number) =>
    api.get<{
      year: number;
      users_with_data: number;
      total_tickets: number;
      avg_resolution_hours?: number;
      sla_compliance_pct?: number;
      monthly_breakdown: Array<{
        month: string;
        total_tickets: number;
        avg_resolution_hours?: number;
      }>;
      per_user_summary: Array<{
        user_id: number;
        username: string;
        name: string;
        total_tickets: number;
        avg_resolution_hours?: number;
        sla_compliance_pct?: number;
        fields_populated?: string[];
        months_with_data?: number;
      }>;
    }>("/plugins/ticket_kpi/dashboard/team_yearly_summary/", { params: { year } }),

  // Reports
  getYearlySummary: (year: number, userIds?: number[], teamId?: number) =>
    api.get<YearlyReport>("/plugins/ticket_kpi/reports/yearly_summary/", {
      params: {
        year,
        ...(userIds ? { user_ids: userIds.join(",") } : {}),
        ...(teamId ? { team_id: teamId } : {}),
      },
    }),
  exportExcel: (year: number, userIds?: number[]) =>
    api.get(`/plugins/ticket_kpi/reports/export_excel/`, {
      params: {
        year,
        ...(userIds ? { user_ids: userIds.join(",") } : {}),
      },
      responseType: "blob",
    }),
  exportCSV: (year: number, userIds?: number[]) =>
    api.get(`/plugins/ticket_kpi/reports/export_csv/`, {
      params: {
        year,
        ...(userIds ? { user_ids: userIds.join(",") } : {}),
      },
      responseType: "blob",
    }),
  downloadReport: async (
    year: number,
    format: "excel" | "csv",
    userIds?: number[]
  ): Promise<Blob> => {
    const response =
      format === "excel"
        ? await api.get(`/plugins/ticket_kpi/reports/export_excel/`, {
            params: { year, ...(userIds ? { user_ids: userIds.join(",") } : {}) },
            responseType: "blob",
          })
        : await api.get(`/plugins/ticket_kpi/reports/export_csv/`, {
            params: { year, ...(userIds ? { user_ids: userIds.join(",") } : {}) },
            responseType: "blob",
          });
    return response.data as Blob;
  },

  // KPI Evidence
  async getEvidence(params?: {
    month?: string;
    client_id?: number;
    status?: string;
    user_id?: number;
  }): Promise<KPIEvidence[]> {
    const { data } = await api.get<KPIEvidence[] | PaginatedResponse<KPIEvidence>>(
      "/plugins/ticket_kpi/evidence/",
      { params }
    );
    return normalizeList(data);
  },
  getEvidenceDetail: (id: number) => api.get<KPIEvidence>(`/plugins/ticket_kpi/evidence/${id}/`),
  createEvidence: (form: FormData) =>
    api.post<KPIEvidence>("/plugins/ticket_kpi/evidence/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  updateEvidence: (id: number, form: FormData) =>
    api.patch<KPIEvidence>(`/plugins/ticket_kpi/evidence/${id}/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteEvidence: (id: number) => api.delete(`/plugins/ticket_kpi/evidence/${id}/`),
  reviewEvidence: (id: number, status: "approved" | "rejected") =>
    api.post<KPIEvidence>(`/plugins/ticket_kpi/evidence/${id}/review/`, { status }),
  unreviewEvidence: (id: number) =>
    api.post<KPIEvidence>(`/plugins/ticket_kpi/evidence/${id}/unreview/`),
  getEmailPreview: (id: number) =>
    api.get<{ [key: string]: unknown }>(`/plugins/ticket_kpi/evidence/${id}/email_preview/`),

  /** Download/preview an evidence file as a blob (authenticated). */
  async downloadEvidenceFile(id: number): Promise<Blob> {
    const { data } = await api.get<Blob>(`/plugins/ticket_kpi/evidence/${id}/download/`, {
      responseType: "blob",
    });
    return data;
  },

  // Ticket-overtime links
  async searchTickets(query: string): Promise<{ results: TicketSearchResult[] }> {
    const { data } = await api.get<{ results: TicketSearchResult[] }>(
      "/plugins/ticket_kpi/links/search_tickets/",
      { params: { q: query } }
    );
    return data;
  },
  async getOvertimeLinks(overtimeLogId: number): Promise<{ results: TicketOvertimeLink[] }> {
    const { data } = await api.get<{ results: TicketOvertimeLink[] }>(
      "/plugins/ticket_kpi/links/overtime_links/",
      { params: { overtime_log_id: overtimeLogId } }
    );
    return data;
  },
  async getLinks(params?: {
    review_status?: "pending" | "confirmed" | "rejected";
  }): Promise<TicketOvertimeLink[]> {
    const { data } = await api.get<TicketOvertimeLink[] | PaginatedResponse<TicketOvertimeLink>>(
      "/plugins/ticket_kpi/links/",
      { params }
    );
    return normalizeList(data);
  },
  async createLink(
    overtimeLogId: number,
    normalizedTicketId: number,
    note = ""
  ): Promise<TicketOvertimeLink> {
    const { data } = await api.post<TicketOvertimeLink>("/plugins/ticket_kpi/links/", {
      overtime_log: overtimeLogId,
      normalized_ticket: normalizedTicketId,
      note,
    });
    return data;
  },
  async deleteLink(linkId: number): Promise<void> {
    await api.delete(`/plugins/ticket_kpi/links/${linkId}/`);
  },
  async reviewLink(
    linkId: number,
    decision: "confirmed" | "rejected"
  ): Promise<TicketOvertimeLink> {
    const { data } = await api.post<TicketOvertimeLink>(
      `/plugins/ticket_kpi/links/${linkId}/review/`,
      { decision }
    );
    return data;
  },

  // Ticket records (detailed view with dynamic fields + server-side filters)
  // Either `month` (YYYY-MM-DD) or `year` (YYYY) must be provided.
  async getTickets(params: TicketQueryParams): Promise<TicketListResponse> {
    const { data } = await api.get<TicketListResponse>("/plugins/ticket_kpi/dashboard/tickets/", {
      params: buildTicketQueryParams(params),
    });
    return data;
  },
};
