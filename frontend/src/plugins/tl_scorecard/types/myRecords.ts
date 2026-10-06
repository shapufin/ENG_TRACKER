export interface MyOneOnOne {
  id: number;
  occurred_on: string;
  with_name: string;
  summary: string;
}

export interface MyPip {
  id: number;
  status: "active" | "completed" | "cancelled";
  start_date: string;
  closed_on: string | null;
  shared_notes: string;
}

export interface MyEprCycle {
  id: number;
  year: number;
  goal_setting_completed_at: string | null;
  mid_year_completed_at: string | null;
  final_review_completed_at: string | null;
  goals: { id: number; description: string }[];
  /** Stage summaries the TL marked "Shared with employee". */
  stage_summaries: { stage: string; summary: string }[];
}

export interface MyRecords {
  one_on_ones: MyOneOnOne[];
  pips: MyPip[];
  epr_cycles: MyEprCycle[];
}
