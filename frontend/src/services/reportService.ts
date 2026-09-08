// fallow-ignore-file unused-type
import api from "@/lib/api";

export interface SummaryReportParams {
  start_date?: string;
  end_date?: string;
  report_type?: "overtime" | "standby" | "leave" | "combined";
  italian_tl_id?: string;
  albanian_tl_id?: string;
  workspace_ids?: string;
  team_ids?: string;
}

export interface DetailedReportParams {
  start_date?: string;
  end_date?: string;
  report_type?: "overtime" | "standby" | "leave" | "combined";
  group_by?: "user" | "month" | "year";
  italian_tl_id?: string;
  albanian_tl_id?: string;
  workspace_ids?: string;
  team_ids?: string;
}

export interface ExportExcelParams extends SummaryReportParams {
  group_by_tl?: boolean;
}

export interface SummaryReport {
  overtime?: {
    total_hours: number;
    total_entries: number;
    approved_hours: number;
    pending_count: number;
  };
  standby?: {
    total_hours: number;
    total_entries: number;
    approved_hours: number;
    pending_count: number;
  };
  leave?: {
    total_requests: number;
    total_days: number;
    approved_days: number;
    pending_count: number;
  };
}

export interface DetailedUserReport {
  user_id: number;
  username: string;
  full_name: string;
  team: string | null;
  leave_balance?: number;
  overtime?: { total_hours: number; approved_hours: number; entries: number };
  standby?: { total_hours: number; approved_hours: number; entries: number };
  leave?: { total_days: number; approved_days: number; entries: number };
}

export interface DetailedReport {
  group_by: string;
  users: DetailedUserReport[];
  overtime?: Array<{ month?: string; year?: string; total_hours: number; entries: number }>;
  standby?: Array<{ month?: string; year?: string; total_hours: number; entries: number }>;
  leave?: Array<{ month?: string; year?: string; total_days: number; entries: number }>;
}

export interface TeamOption {
  id: number;
  name: string;
  code: string;
  members_count: number;
}

export interface WorkspaceOption {
  id: number;
  name: string;
  user_count: number;
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  configuration: Record<string, unknown>;
  report_type: string;
}

export const reportService = {
  async getSummary(params: SummaryReportParams): Promise<SummaryReport> {
    const { data } = await api.get<SummaryReport>("/reports/summary/", { params });
    return data;
  },

  async getDetailed(params: DetailedReportParams): Promise<DetailedReport> {
    const { data } = await api.get<DetailedReport>("/reports/detailed/", { params });
    return data;
  },

  async exportExcel(params: ExportExcelParams): Promise<Blob> {
    const { data } = await api.get<Blob>("/reports/export-excel/", {
      params,
      responseType: "blob",
    });
    return data;
  },

  async getTeams(): Promise<TeamOption[]> {
    const { data } = await api.get<TeamOption[]>("/users/teams/list_for_reports/");
    return data;
  },

  async getWorkspaces(): Promise<WorkspaceOption[]> {
    const { data } = await api.get<WorkspaceOption[]>(
      "/dashboard/calendar-workspaces/list_for_reports/"
    );
    return data;
  },

  async getTemplates(): Promise<ReportTemplate[]> {
    const { data } = await api.get<ReportTemplate[]>("/reports/templates/");
    return data;
  },

  async applyTemplate(templateId: number): Promise<ReportTemplate> {
    const { data } = await api.post<ReportTemplate>(`/reports/templates/${templateId}/apply/`);
    return data;
  },

  async getInsights(
    params: SummaryReportParams
  ): Promise<{ overtime_increase: number; leave_utilization: number; standby_coverage: number }> {
    const { data } = await api.get("/reports/insights/", { params });
    return data;
  },

  async getTopTeamLeaders(
    params: SummaryReportParams
  ): Promise<
    Array<{ id: number; name: string; rank: number; total_hours: number; team_name: string | null }>
  > {
    const { data } = await api.get("/reports/top-team-leaders/", { params });
    return data;
  },

  async exportOTStandby(params: {
    start_date?: string;
    end_date?: string;
    italian_tl_ids?: string;
    albanian_tl_ids?: string;
    workspace_ids?: string;
    status?: "approved" | "pending";
  }): Promise<Blob> {
    const { data } = await api.get<Blob>("/reports/export-ot-standby/", {
      params,
      responseType: "blob",
    });
    return data;
  },

  async exportPayrollOTStandby(params: {
    start_date?: string;
    end_date?: string;
    italian_tl_ids?: string;
    albanian_tl_ids?: string;
    workspace_ids?: string;
    status?: "approved" | "pending";
  }): Promise<Blob> {
    const { data } = await api.get<Blob>("/reports/export-ot-standby/", {
      params: { ...params, date_mode: "processing_period" },
      responseType: "blob",
    });
    return data;
  },

  async exportLeave(params: {
    start_date?: string;
    end_date?: string;
    italian_tl_ids?: string;
    albanian_tl_ids?: string;
    workspace_ids?: string;
  }): Promise<Blob> {
    const { data } = await api.get<Blob>("/reports/export-leave/", {
      params,
      responseType: "blob",
    });
    return data;
  },
};
