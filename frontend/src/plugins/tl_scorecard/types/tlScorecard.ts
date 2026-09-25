export interface LeaveSla {
  decided_count: number;
  pct_within_2_days: number | null;
  pending_at_month_end: number;
}

export interface OvertimeTurnaround {
  decided_count: number;
  avg_turnaround_days: number | null;
}

export interface Scorecard {
  month: string;
  team_size: number;
  leave: LeaveSla;
  overtime: OvertimeTurnaround;
}

export type KpiStatus = "measured" | "approximate" | "planned" | "blocked" | "excluded";

export interface KpiCoverageEntry {
  kpi: string;
  sheet: number;
  status: KpiStatus;
  phase: number | null;
  note: string;
}
