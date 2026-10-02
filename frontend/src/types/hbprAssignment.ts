export interface HbprPersonRef {
  id: number;
  name: string;
}

export type HbprCadence = "weekly" | "biweekly" | "monthly";

export type HbprCadenceStatus = "not_started" | "on_track" | "due" | "overdue" | "ended";

/**
 * An explicit, dated HBPR ↔ Albanian TL assignment. One open row per Albanian
 * TL; history is retained via `effective_to`. Identity and range are immutable
 * once created — use `end` or `reassign`.
 */
export interface HbprAssignment {
  id: number;
  hbpr: number;
  albanian_tl: number;
  hbpr_detail: HbprPersonRef;
  albanian_tl_detail: HbprPersonRef;
  cadence: HbprCadence;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  last_meeting_on: string | null;
  next_due_on: string | null;
  cadence_status: HbprCadenceStatus;
  evidence_count: number;
}

export interface HbprAssignmentPayload {
  hbpr: number;
  albanian_tl: number;
  cadence: HbprCadence;
  effective_from: string;
}

export interface HbprReassignPayload {
  new_hbpr: number;
  cadence: HbprCadence;
  effective_from: string;
}

export const CADENCE_LABELS: Record<HbprCadence, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export const CADENCE_STATUS_LABELS: Record<HbprCadenceStatus, string> = {
  not_started: "Not started",
  on_track: "On track",
  due: "Due",
  overdue: "Overdue",
  ended: "Ended",
};
