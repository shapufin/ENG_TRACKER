// fallow-ignore-file unused-type
export * from "./auth";
import type { User } from "./auth";

export interface Tech {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TechMember {
  id: number;
  username: string;
  email: string;
  full_name: string;
}

export interface Team {
  id: number;
  name: string;
  code: string;
  description: string;
  parent_team: number | null;
  parent_team_name?: string;
  team_leader: User | null;
  team_leader_id?: number | null;
  sub_teams_count?: number;
  calendar_group: string;
  members_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CalendarWorkspace {
  id: number;
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string;
  is_public: boolean;
  team: number | null;
  team_name?: string;
  team_code?: string;
  team_calendar_group?: string;
  default_view: string;
  show_overtime: boolean;
  show_standby: boolean;
  show_vacation: boolean;
  show_holidays: boolean;
}

export interface UserCalendarPreference {
  id: number;
  calendar: number;
  calendar_name?: string;
  calendar_color?: string;
  is_active: boolean;
  is_default: boolean;
  display_color?: string;
  sort_order?: number;
  show_only_my_entries?: boolean;
  show_only_my_team?: boolean;
}

export interface LeaveBalanceSummary {
  user_id: number;
  username: string;
  full_name: string;
  year: number;
  vacation: LeaveTypeSummary;
  /** @deprecated Sick leave is not balanced; field removed from API. */
  sick?: LeaveTypeSummary;
}

export interface LeaveTypeSummary {
  carry_over: LeaveBalanceDetail | null;
  current_year: LeaveBalanceDetail | null;
  total_available: number;
  total_used: number;
  total_pending: number;
}

export interface LeaveBalanceDetail {
  id: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
  effective_available_days: number;
  expires_at?: string | null;
  is_expired?: boolean;
  accrual_start_date?: string | null;
  monthly_accrued_days?: number;
}

export interface UserProfile {
  id: number;
  user: User;
  /** Primary team (backward compat) — SerializerMethodField returns an object, not a bare ID. */
  team: { id: number; name: string; code: string; calendar_group: string } | null;
  team_name?: string;
  team_code?: string;
  /** All team IDs (M2M). Writeable via PrimaryKeyRelatedField. */
  teams: number[];
  /** Full team objects (read-only). */
  teams_detail?: Team[];
  /** Independent technology assignments. */
  techs: number[];
  techs_detail?: Tech[];
  clients?: number[];
  clients_detail?: Client[];
  albanian_tl: number | null;
  albanian_tl_name?: string;
  italian_tl: number | null;
  italian_tl_name?: string;
  is_hr_user: boolean;
  is_italian_tl_role?: boolean;
  is_albanian_tl_role?: boolean;
  phone: string;
  hire_date: string | null;
  groups: string[];
  current_month_overtime_hours?: number;
  current_month_standby_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export type Status = "pending" | "approved" | "rejected";

export type EventTypeVariant = "overtime" | "standby" | "vacation" | "sick" | "holiday";

export interface OvertimeLog {
  id: number;
  user: number;
  user_name?: string;
  user_full_name?: string;
  team_id?: number | null;
  team_name?: string;
  client: number;
  client_name?: string;
  client_code?: string;
  date: string;
  submitted_at?: string;
  requested_processing_period?: string | null;
  resolved_settlement_period?: string | null;
  approval_period_close?: number | null;
  is_carried_over?: boolean;
  requested_period_label?: string | null;
  resolved_period_label?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours: number;
  description: string;
  evidence_type: "ticket" | "email" | "call" | "other";
  evidence: string;
  ticket_references: string[];
  reference_code: string;
  status: Status;
  status_display?: string;
  approved_by: number | null;
  approved_by_name?: string;
  approved_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface StandbyLog {
  id: number;
  user: number;
  user_name?: string;
  user_full_name?: string;
  team_id?: number | null;
  team_name?: string;
  pattern: number | null;
  pattern_name?: string;
  client_ids?: number[];
  client_names?: string[];
  date: string;
  submitted_at?: string;
  requested_processing_period?: string | null;
  resolved_settlement_period?: string | null;
  approval_period_close?: number | null;
  is_carried_over?: boolean;
  requested_period_label?: string | null;
  resolved_period_label?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours: number;
  description: string;
  evidence: string;
  status: Status;
  status_display?: string;
  approved_by: number | null;
  approved_by_name?: string;
  approved_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: number;
  user: number;
  user_name?: string;
  user_full_name?: string;
  team_id?: number | null;
  team_name?: string;
  user_leave_balance?: number;
  request_type: "vacation" | "sick";
  request_type_display?: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string;
  status: Status | "cancelled";
  status_display?: string;
  approved_by: number | null;
  approved_by_name?: string;
  approved_at: string | null;
  balance_id?: number | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface GlobalSettings {
  id: number;
  default_yearly_leave_days: number;
  carry_over_expiry_month: number;
  carry_over_expiry_day: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalance {
  id: number;
  user: number;
  user_name?: string;
  leave_type: "vacation" | "sick";
  year: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  available_days: number;
  effective_available_days?: number;
  is_carry_over?: boolean;
  expires_at?: string | null;
  accrual_start_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Month with pending item count — returned by team_pending_months endpoints. */
export interface PendingMonthEntry {
  month: string;
  count: number;
}

export interface OvertimeSummary {
  total_hours: number;
  total_entries: number;
  approved_hours: number;
  pending_hours: number;
  rejected_hours: number;
}

export interface DashboardStats {
  total_users: number;
  total_overtime_hours: number;
  total_standby_hours: number;
  pending_overtime: number;
  approved_overtime: number;
  rejected_overtime: number;
  pending_standby: number;
  approved_standby: number;
  rejected_standby: number;
  pending_leaves: number;
  approved_leaves: number;
  rejected_leaves: number;
  avg_overtime_hours: number;
  active_teams_count: number;
}

export interface UserStats {
  total_users: number;
  italian_tl_count: number;
  albanian_tl_count: number;
  no_tl_count: number;
  active_today_count: number;
}

export interface CalendarGroupStats {
  active_groups: number;
  teams_grouped: number;
  teams_ungrouped: number;
  total_teams: number;
  groups: Array<{
    calendar_group: string;
    team_count: number;
  }>;
}

export interface PublicHoliday {
  id: number;
  name: string;
  date: string;
  country_code?: string;
  is_global: boolean;
  description?: string;
  calendar?: number | null;
  calendar_name?: string;
}

export interface TeamDashboardStats {
  pending_team_overtime: number;
  pending_team_standby: number;
  pending_team_leaves: number;
  team_size: number;
  approved_count?: number;
  rejected_count?: number;
  total_count?: number;
}

export interface PendingTrendData {
  date: string;
  count: number;
}

export interface TopPendingUser {
  user_id: number;
  user_name: string;
  pending_count: number;
}

export interface QueueHighlight {
  id: number;
  type: "overtime" | "standby" | "leave";
  user_name: string;
  date: string;
  details: string;
  status: Status;
}

export interface MonthlyComparisonData {
  current_month: {
    month: number;
    year: number;
    month_name: string;
    data: {
      overtime: number;
      standby: number;
      leave: number;
      total: number;
    };
    daily_average: number;
  };
  previous_month: {
    month: number;
    year: number;
    month_name: string;
    data: {
      overtime: number;
      standby: number;
      leave: number;
      total: number;
    };
    daily_average: number;
  };
  comparison: {
    percent_change: number;
    is_positive: boolean;
    trend: "increasing" | "decreasing" | "stable";
  };
}

export interface GroupPluginAccess {
  plugin_name: string;
  action: string;
}

export interface Group {
  id: number;
  name: string;
  code: string;
  description?: string;
  created_at?: string;
  member_count?: number;
  plugin_access?: GroupPluginAccess[];
}

export interface Role {
  id: number;
  name: string;
  code: string;
  description: string;
  created_at: string;
}

export interface PermissionItem {
  id: number;
  module: string;
  action: string;
  description: string;
  created_at: string;
}

export interface UserRole {
  id: number;
  user: number;
  user_name?: string;
  role: number;
  role_name?: string;
  team: number | null;
  team_name?: string;
  is_active: boolean;
}

export interface UserGroup {
  id: number;
  user: number;
  user_name?: string;
  group: number;
  group_name?: string;
}

/** Lightweight user record returned by the group member-candidates endpoint. */
export interface MemberCandidate {
  id: number;
  username: string;
  email: string;
  full_name: string;
}

export interface RolePermission {
  id: number;
  role: number;
  role_name?: string;
  permission: number;
  permission_codename?: string;
  permission_module?: string;
  permission_action?: string;
}

export interface ScheduledReport {
  id: number;
  name: string;
  description: string;
  schedule_type: "daily" | "weekly" | "monthly";
  schedule_type_display: string;
  recipients: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter_preset: Record<string, any>;
  report_format: "excel" | "csv" | "pdf";
  report_format_display: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout_config: Record<string, any>;
  column_selection: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chart_config: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  branding_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ApiError {
  response?: {
    data?: Record<string, string | string[]>;
    status?: number;
  };
  message: string;
}
