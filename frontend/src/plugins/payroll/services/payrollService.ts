/**
 * Payroll plugin API service.
 */
import api from "@/lib/api";
import { normalizeList } from "@/lib/api-utils";
import { downloadBlobResponse } from "@/lib/download";
import type { PaginatedResponse } from "@/types";
import type {
  PayrollConfiguration,
  PayrollContributionRate,
  PayrollLine,
  PayrollPreviewResult,
  PayrollRun,
  PayrollRunCreatePayload,
  ClosureStatus,
  PayrollTaxBracket,
  PayrollOvertimeCategory,
  PayrollRuleSet,
  PayrollRuleSetAtomicSavePayload,
  PayrollWorkCalendar,
  PayrollWorkCalendarMonthSummary,
  WageAssignment,
  ConfigurationChoices,
  EligibleUser,
  WageBulkItem,
  WageBulkCreateResult,
  PayrollWorkday,
} from "../types";

const BASE = "/plugins/payroll";

export const payrollService = {
  // --- Configuration ---
  async getConfiguration(): Promise<PayrollConfiguration> {
    const { data } = await api.get<PayrollConfiguration>(`${BASE}/configuration/`);
    return data;
  },

  async updateConfiguration(payload: Partial<PayrollConfiguration>): Promise<PayrollConfiguration> {
    const { data } = await api.patch<PayrollConfiguration>(`${BASE}/configuration/1/`, payload);
    return data;
  },

  async getConfigurationChoices(): Promise<ConfigurationChoices> {
    const { data } = await api.get<ConfigurationChoices>(`${BASE}/configuration/choices/`);
    return data;
  },

  // --- Wages ---
  async getWages(params?: Record<string, unknown>): Promise<WageAssignment[]> {
    const { data } = await api.get<WageAssignment[] | PaginatedResponse<WageAssignment>>(
      `${BASE}/wages/`,
      { params }
    );
    return normalizeList(data);
  },

  async createWage(payload: Partial<WageAssignment>): Promise<WageAssignment> {
    const { data } = await api.post<WageAssignment>(`${BASE}/wages/`, payload);
    return data;
  },

  async updateWage(id: number, payload: Partial<WageAssignment>): Promise<WageAssignment> {
    const { data } = await api.patch<WageAssignment>(`${BASE}/wages/${id}/`, payload);
    return data;
  },

  async deleteWage(id: number): Promise<void> {
    await api.delete(`${BASE}/wages/${id}/`);
  },

  async getWageHistory(userId?: number): Promise<WageAssignment[]> {
    const { data } = await api.get<WageAssignment[] | PaginatedResponse<WageAssignment>>(
      `${BASE}/wages/history/`,
      { params: userId ? { user_id: userId } : undefined }
    );
    return normalizeList(data);
  },

  async getEligibleUsers(): Promise<EligibleUser[]> {
    const { data } = await api.get<EligibleUser[]>(`${BASE}/wages/eligible_users/`);
    return data;
  },

  async bulkCreateWages(assignments: WageBulkItem[]): Promise<WageBulkCreateResult> {
    const { data } = await api.post<WageBulkCreateResult>(`${BASE}/wages/bulk_create/`, {
      assignments,
    });
    return data;
  },

  // --- Rule sets ---
  async getRuleSets(params?: Record<string, unknown>): Promise<PayrollRuleSet[]> {
    const { data } = await api.get<PayrollRuleSet[] | PaginatedResponse<PayrollRuleSet>>(
      `${BASE}/rule-sets/`,
      { params }
    );
    return normalizeList(data);
  },

  async cloneRuleSet(
    id: number,
    payload: {
      code: string;
      version: string;
      effective_from: string;
      name?: string;
      effective_to?: string | null;
      is_active?: boolean;
      source?: string;
      notes?: string;
      validation_status?: string;
    }
  ): Promise<PayrollRuleSet> {
    const { data } = await api.post<PayrollRuleSet>(`${BASE}/rule-sets/${id}/clone/`, payload);
    return data;
  },

  async saveRuleSet(id: number, payload: PayrollRuleSetAtomicSavePayload): Promise<PayrollRuleSet> {
    const { data } = await api.post<PayrollRuleSet>(
      `${BASE}/rule-sets/${id}/atomic-save/`,
      payload
    );
    return data;
  },

  async createTaxBracket(ruleSetId: number, payload: Partial<PayrollTaxBracket>) {
    const { data } = await api.post(`${BASE}/rule-sets/${ruleSetId}/tax-brackets/`, payload);
    return data as PayrollTaxBracket;
  },
  async updateTaxBracket(id: number, ruleSetId: number, payload: Partial<PayrollTaxBracket>) {
    const { data } = await api.patch(`${BASE}/rule-sets/${ruleSetId}/tax-brackets/${id}/`, payload);
    return data as PayrollTaxBracket;
  },
  async deleteTaxBracket(id: number, ruleSetId: number) {
    await api.delete(`${BASE}/rule-sets/${ruleSetId}/tax-brackets/${id}/`);
  },
  async createContribution(ruleSetId: number, payload: Partial<PayrollContributionRate>) {
    const { data } = await api.post(`${BASE}/rule-sets/${ruleSetId}/contributions/`, payload);
    return data as PayrollContributionRate;
  },
  async updateContribution(
    id: number,
    ruleSetId: number,
    payload: Partial<PayrollContributionRate>
  ) {
    const { data } = await api.patch(
      `${BASE}/rule-sets/${ruleSetId}/contributions/${id}/`,
      payload
    );
    return data as PayrollContributionRate;
  },
  async deleteContribution(id: number, ruleSetId: number) {
    await api.delete(`${BASE}/rule-sets/${ruleSetId}/contributions/${id}/`);
  },
  async createOvertimeCategory(ruleSetId: number, payload: Partial<PayrollOvertimeCategory>) {
    const { data } = await api.post(`${BASE}/rule-sets/${ruleSetId}/overtime-categories/`, payload);
    return data as PayrollOvertimeCategory;
  },
  async updateOvertimeCategory(
    id: number,
    ruleSetId: number,
    payload: Partial<PayrollOvertimeCategory>
  ) {
    const { data } = await api.patch(
      `${BASE}/rule-sets/${ruleSetId}/overtime-categories/${id}/`,
      payload
    );
    return data as PayrollOvertimeCategory;
  },
  async deleteOvertimeCategory(id: number, ruleSetId: number) {
    await api.delete(`${BASE}/rule-sets/${ruleSetId}/overtime-categories/${id}/`);
  },

  // --- Work calendar ---
  async getWorkCalendars(params?: Record<string, unknown>): Promise<PayrollWorkCalendar[]> {
    const { data } = await api.get<PayrollWorkCalendar[] | PaginatedResponse<PayrollWorkCalendar>>(
      `${BASE}/work-calendar/`,
      { params }
    );
    return normalizeList(data);
  },

  async generateWorkCalendarYear(id: number): Promise<{ status: string; workday_count: number }> {
    const { data } = await api.post<{ status: string; workday_count: number }>(
      `${BASE}/work-calendar/${id}/generate_year/`
    );
    return data;
  },

  async getWorkCalendarMonthSummary(
    id: number,
    month: number
  ): Promise<PayrollWorkCalendarMonthSummary> {
    const { data } = await api.get<PayrollWorkCalendarMonthSummary>(
      `${BASE}/work-calendar/${id}/month_summary/`,
      { params: { month } }
    );
    return data;
  },

  async addHoliday(calendarId: number, date: string, name: string): Promise<PayrollWorkday> {
    const { data } = await api.post<PayrollWorkday>(
      `${BASE}/work-calendar/${calendarId}/holidays/add/`,
      { date, name }
    );
    return data;
  },

  async updateHoliday(
    calendarId: number,
    workdayId: number,
    name: string
  ): Promise<PayrollWorkday> {
    const { data } = await api.patch<PayrollWorkday>(
      `${BASE}/work-calendar/${calendarId}/holidays/${workdayId}/update/`,
      { name }
    );
    return data;
  },

  async removeHoliday(calendarId: number, workdayId: number): Promise<void> {
    await api.delete(`${BASE}/work-calendar/${calendarId}/holidays/${workdayId}/remove/`);
  },

  // --- Runs ---
  async getRuns(params?: Record<string, unknown>): Promise<PayrollRun[]> {
    const { data } = await api.get<PayrollRun[] | PaginatedResponse<PayrollRun>>(`${BASE}/runs/`, {
      params,
    });
    return normalizeList(data);
  },

  async getRun(id: number): Promise<PayrollRun> {
    const { data } = await api.get<PayrollRun>(`${BASE}/runs/${id}/`);
    return data;
  },

  async getPeriodClosureStatus(runId: number): Promise<ClosureStatus> {
    const { data } = await api.get<ClosureStatus>(`${BASE}/runs/${runId}/period-closure-status/`);
    return data;
  },

  async createRun(payload: PayrollRunCreatePayload): Promise<PayrollRun> {
    const { data } = await api.post<PayrollRun>(`${BASE}/runs/`, payload);
    return data;
  },

  async generateRun(
    id: number,
    userIds?: number[]
  ): Promise<{ status: string; line_count: number; run: PayrollRun }> {
    const { data } = await api.post(`${BASE}/runs/${id}/generate/`, {
      user_ids: userIds ?? [],
    });
    return data;
  },

  async generateLine(
    runId: number,
    userId: number
  ): Promise<{ status: string; line: PayrollLine }> {
    const { data } = await api.post(`${BASE}/runs/${runId}/generate_line/`, {
      user_id: userId,
    });
    return data;
  },

  async finalizeRun(id: number): Promise<PayrollRun> {
    const { data } = await api.post<PayrollRun>(`${BASE}/runs/${id}/finalize/`);
    return data;
  },

  async cancelRun(id: number): Promise<PayrollRun> {
    const { data } = await api.post<PayrollRun>(`${BASE}/runs/${id}/cancel/`);
    return data;
  },

  async deleteRun(id: number): Promise<void> {
    await api.delete(`${BASE}/runs/${id}/`);
  },

  async getRunLines(id: number): Promise<PayrollLine[]> {
    const { data } = await api.get<PayrollLine[]>(`${BASE}/runs/${id}/lines/`);
    return data;
  },

  async previewCalculation(
    userId: number,
    year: number,
    month: number
  ): Promise<PayrollPreviewResult> {
    const { data } = await api.post<PayrollPreviewResult>(`${BASE}/runs/preview/`, {
      user_id: userId,
      year,
      month,
    });
    return data;
  },

  // --- Exports ---
  async exportRunExcel(id: number): Promise<void> {
    const response = await api.get(`${BASE}/runs/${id}/export_excel/`, {
      responseType: "blob",
    });
    downloadBlobResponse(response.data, `payroll_run_${id}.xlsx`);
  },

  async downloadPayslip(runId: number, lineId: number): Promise<void> {
    const response = await api.get(`${BASE}/runs/${runId}/payslip/`, {
      params: { line_id: lineId },
      responseType: "blob",
    });
    downloadBlobResponse(response.data, `payslip_${lineId}.pdf`);
  },
};
