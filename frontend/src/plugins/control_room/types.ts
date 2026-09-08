/**
 * Control Room plugin types.
 *
 * These mirror the backend response shapes from
 * plugins/control_room/viewsets.py and services/dashboard_service.py.
 */

export interface ControlRoomTeamScope {
  id: number;
  access: number;
  team: number;
  team_name: string;
  team_code: string;
  include_subteams: boolean;
  created_at: string;
}

export interface ControlRoomAccess {
  id: number;
  user: number;
  username: string;
  user_name: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  is_active: boolean;
  display_name: string;
  timezone: string;
  team_scopes: ControlRoomTeamScope[];
  team_ids: number[];
  created_by: number | null;
  created_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ControlRoomMeResponse {
  has_access: boolean;
  is_global: boolean;
  team_ids: number[] | null;
  access: ControlRoomAccess | null;
}

export type StatusMode = "pending_approved" | "approved_only" | "all";

export interface ControlRoomScope {
  is_global: boolean;
  team_ids: number[] | null;
}

export interface ControlRoomSummary {
  team_count: number;
  covered_team_count: number;
  uncovered_team_count: number;
  person_count: number;
  standby_entry_count: number;
  planned_hours: number;
  approved_hours: number;
  pending_hours: number;
}

export interface ControlRoomCoverage {
  team_id: number;
  team_name: string;
  team_code: string;
  member_count: number;
  covered_member_count: number;
  planned_hours: number;
  approved_hours: number;
  pending_hours: number;
  coverage_percent: number;
}

export interface ControlRoomSummaryResponse {
  date_from: string;
  date_to: string;
  scope: ControlRoomScope;
  summary: ControlRoomSummary;
  coverage_by_team: ControlRoomCoverage[];
}

export interface ControlRoomTrendPoint {
  date: string;
  planned_hours: number;
  approved_hours: number;
  standby_people: number;
}

export interface ControlRoomRosterRow {
  id: number;
  date: string;
  user_id: number;
  user_name: string;
  username: string;
  team_names: string[];
  hours: number;
  start_time: string | null;
  end_time: string | null;
  is_overnight: boolean;
  status: string;
  status_display: string;
  description: string;
}

export interface ControlRoomRosterResponse {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: ControlRoomRosterRow[];
}

export interface ControlRoomDashboardParams {
  date_from: string;
  date_to: string;
  /** Comma-separated team IDs for the query param (e.g. "1,2,3"). */
  team_ids?: string;
  status_mode?: StatusMode;
  include_rejected?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}
