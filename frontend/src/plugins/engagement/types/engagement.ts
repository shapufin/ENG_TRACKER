export type EngagementAgingBuckets = {
  "<4h": number;
  "4-24h": number;
  "1-3d": number;
  ">3d": number;
};

export interface EngagementTypeMetrics {
  submitted: number;
  decided: number;
  approved: number;
  rejected: number;
  judgeable: number;
  on_time: number;
  breaches: number;
  pending_past_deadline: number;
  avg_tta_hours: number | null;
  p50_tta_hours: number | null;
  p90_tta_hours: number | null;
  median_fraction: number | null;
  aging: EngagementAgingBuckets;
  resubmission_count: number;
}

export interface EngagementSummary {
  month: string | null;
  team_count: number;
  team_size: number;
  active_submitters: number;
  approval_rate_pct: number | null;
  resubmission_count: number;
  engagement_score: number | null;
  avg_tta_hours: number | null;
  score_speed: number | null;
  score_approval_rate: number | null;
  score_responsiveness: number | null;
  score_consistency: number | null;
  judgeable: number;
  on_time: number;
  breaches: number;
  pending_past_deadline: number;
  decisions_during_leave: number;
  decisions_on_holidays: number;
  refreshed_on_read: boolean;
  computed_at: string | null;
}

export interface EngagementTrendPoint {
  month: string;
  engagement_score: number | null;
  avg_tta_hours: number | null;
  decisions_during_leave: number;
  decisions_on_holidays: number;
  score_speed: number | null;
  score_approval_rate: number | null;
  score_responsiveness: number | null;
  score_consistency: number | null;
}

export interface EngagementTeamBreakdownRow {
  id: number;
  leader: number;
  leader_name: string;
  team: number;
  team_name: string;
  month: string;
  metrics: Record<"leave" | "overtime" | "standby", EngagementTypeMetrics>;
  team_size: number;
  active_submitters: number;
  approval_rate_pct: number | null;
  resubmission_count: number;
  engagement_score: number | null;
  score_speed: number | null;
  score_approval_rate: number | null;
  score_responsiveness: number | null;
  score_consistency: number | null;
  decisions_during_leave: number;
  decisions_on_holidays: number;
  next_deadline_at: string | null;
  computed_at: string | null;
}

export interface EngagementStatus {
  has_data: boolean;
  month?: string;
  refreshed_on_read?: boolean;
  computed_at: string | null;
}
