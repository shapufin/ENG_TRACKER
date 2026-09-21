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
  avg_tta_hours: number | null;
  p50_tta_hours: number | null;
  p90_tta_hours: number | null;
  aging: EngagementAgingBuckets;
  pending_over_48h: number;
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
  is_stale: boolean;
  computed_at: string | null;
}

export interface EngagementTrendPoint {
  month: string;
  engagement_score: number | null;
  avg_tta_hours: number | null;
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
  score_activity: number | null;
  score_consistency: number | null;
  computed_at: string | null;
  is_stale: boolean;
}

export interface EngagementStatus {
  has_data: boolean;
  month?: string;
  is_stale: boolean;
  computed_at: string | null;
}
