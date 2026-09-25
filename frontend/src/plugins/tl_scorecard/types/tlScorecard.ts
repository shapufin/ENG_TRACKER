export interface LeaveSla {
  decided_count: number;
  pct_within_2_days: number | null;
  pending_at_month_end: number;
}

export interface OvertimeTurnaround {
  decided_count: number;
  avg_turnaround_days: number | null;
}

export interface MeetingCompliance {
  one_on_one_compliance_pct: number | null;
  tl_sync_count: number;
  team_meetings_held: number;
  team_meetings_with_hrbp: number;
  team_meeting_notes_within_24h: number;
}

export interface IdleMetrics {
  open_count: number;
  resolved_count: number;
}

export interface SeniorityRatio {
  junior: number;
  mid: number;
  senior: number;
  unset: number;
}

export interface Scorecard {
  month: string;
  team_size: number;
  leave: LeaveSla;
  overtime: OvertimeTurnaround;
  meetings: MeetingCompliance;
  idle: IdleMetrics;
  review_deliveries_ytd: number;
  seniority: SeniorityRatio;
}

export interface EngagementSurveyTeamAverage {
  period: string;
  average_score: number | null;
  response_count: number;
}

export type KpiStatus = "measured" | "approximate" | "planned" | "blocked" | "excluded";

export interface KpiCoverageEntry {
  kpi: string;
  sheet: number;
  status: KpiStatus;
  phase: number | null;
  note: string;
}
