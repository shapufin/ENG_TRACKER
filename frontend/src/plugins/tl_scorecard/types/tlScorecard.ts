import type { HbprCadence, HbprCadenceStatus } from "@/types/hbprAssignment";

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

export interface AbsenceMetrics {
  open_count: number;
  breached_5_day_sla: number;
}

export interface PipMetrics {
  active_count: number;
  pending_approval_count: number;
}

export interface PromotionRatio {
  promoted_count: number;
  team_size: number;
  promoted_pct: number | null;
  target_pct: number;
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
  absences: AbsenceMetrics;
  pip: PipMetrics;
  promotion: PromotionRatio;
  escalation_count: number;
}

export interface EscalationCandidate {
  kind: string;
  subject_id: number;
  subject_name: string;
  detail: string;
  since: string;
}

export interface EngagementSurveyTeamAverage {
  period: string;
  average_score: number | null;
  response_count: number;
}

// Minimal local shape of the engagement plugin's summary response — only the
// field this plugin actually reads. Kept local (not imported from
// plugins/engagement) so this plugin's build never depends on engagement's
// frontend files existing — see the "Plugin removal safety" invariant.
export interface ApprovalEngagementScore {
  engagement_score: number | null;
}

export interface PIPRecord {
  id: number;
  employee: number;
  employee_name: string | null;
  tl: number;
  tl_name: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  start_date: string;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  notes: string;
  closed_on: string | null;
  status_note: string;
  /** What reviewers (staff) may read; `notes` stays the TL's private evidence. */
  shared_notes?: string;
  reference_url?: string;
}

export type MeetingKind = "one_on_one" | "tl_sync" | "team_meeting";

export type MeetingAttendeeRole = "member" | "hrbp" | "observer";

export interface MeetingAttendee {
  id: number;
  meeting: number;
  user: number;
  user_name: string | null;
  role: MeetingAttendeeRole;
  /** The attendee's own notes — the API redacts them unless the viewer is that attendee or staff. */
  notes: string;
}

export interface Meeting {
  id: number;
  meeting_type: MeetingKind;
  organizer: number;
  organizer_name: string | null;
  counterparty: number | null;
  counterparty_name: string | null;
  team: number | null;
  occurred_on: string;
  notes: string;
  shared_summary: string;
  shared_at: string | null;
  attendees?: MeetingAttendee[];
  notes_published_at?: string | null;
  reference_url?: string;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  recorded_at?: string;
}

/** Weekly check-in logged against an idle flag (`status_updates` on the serializer). */
export interface IdleStatusUpdate {
  id: number;
  flag: number;
  /** Monday of the reported week (YYYY-MM-DD). */
  week_of: string;
  status_note: string;
  productivity_task_snapshot: string;
  recorded_by: number | null;
  recorded_by_name: string | null;
  recorded_at: string;
}

export interface IdleFlag {
  id: number;
  employee: number;
  employee_name: string | null;
  flagged_by: number;
  flagged_by_name: string | null;
  flagged_on: string;
  status: "open" | "resolved";
  productivity_task: string;
  resolved_on: string | null;
  notes: string;
  reference_url?: string;
  status_updates?: IdleStatusUpdate[];
}

export interface Absence {
  id: number;
  employee: number;
  employee_name: string | null;
  flagged_by: number;
  flagged_by_name: string | null;
  absence_date: string;
  reason: string;
  addressed_on: string | null;
  notes: string;
  reference_url?: string;
  recorded_at?: string;
}

export interface ReviewDelivery {
  id: number;
  leader: number;
  leader_name: string | null;
  period: string;
  recipient: string;
  delivered_on: string;
  notes: string;
  reference_url?: string;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
  recorded_at?: string;
}

export interface PromotionFlag {
  id: number;
  employee: number;
  employee_name: string | null;
  nominated_by: number;
  nominated_by_name: string | null;
  nominated_on: string;
  status: "nominated" | "promoted" | "declined";
  decided_on: string | null;
  decided_by: number | null;
  decision_note: string;
  notes: string;
}

export interface EPRGoal {
  id: number;
  cycle: number;
  description: string;
}

export interface EPRCycle {
  id: number;
  user: number;
  user_name: string | null;
  year: number;
  goal_setting_completed_at: string | null;
  mid_year_completed_at: string | null;
  final_review_completed_at: string | null;
  goals: EPRGoal[];
  goal_count: number;
}

export type EPRStage = "goal_setting" | "mid_year" | "final_review";

export type KpiStatus = "measured" | "approximate" | "planned" | "blocked" | "excluded";

export interface KpiCoverageEntry {
  kpi: string;
  sheet: number;
  status: KpiStatus;
  phase: number | null;
  note: string;
}

/** HBPR workspace (GET hbpr/overview/ and hbpr-evidence/). */
export interface PersonRef {
  id: number;
  name: string;
}

// Cadence shape is owned by the core assignment module (the admin page uses the
// same labels); re-exported so this plugin never redefines it.
export type { HbprCadence, HbprCadenceStatus };

export type HbprEvidenceKind = "cadence_meeting" | "epr_mid_year" | "epr_year_end";

/**
 * The HBPR's attention surface: cadence and EPR governance evidence only.
 * There are deliberately no approval/decision counts — the HBPR does not
 * approve a PIP or decide a promotion, so an alert about them would imply an
 * action they cannot take.
 */
export interface HbprNeedsAttention {
  cadence_overdue: number;
  cadence_due: number;
  missing_mid_year_evidence: number;
  missing_year_end_evidence: number;
  /** Evidence rows recorded within `recent_evidence_days`. */
  recent_evidence: number;
}

/** One assigned Albanian TL, with cadence and EPR governance state. */
export interface HbprLeaderRow extends PersonRef {
  assignment_id: number;
  cadence: HbprCadence;
  team_size: number;
  last_meeting_on: string | null;
  next_due_on: string | null;
  cadence_status: HbprCadenceStatus;
  epr_mid_year: boolean;
  epr_year_end: boolean;
  evidence_count: number;
  last_evidence_on: string | null;
}

export interface HbprOverview {
  reporting_year: number;
  recent_evidence_days: number;
  needs_attention: HbprNeedsAttention;
  leaders: HbprLeaderRow[];
}

export interface HbprEvidence {
  id: number;
  assignment: number;
  albanian_tl: number;
  hbpr: number;
  cadence: HbprCadence;
  kind: HbprEvidenceKind;
  kind_display: string;
  occurred_on: string;
  reporting_year: number | null;
  shared_summary: string;
  action_items: string;
  reference_url: string;
  recorded_by: number;
  recorded_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  next_due_on: string | null;
  cadence_status: HbprCadenceStatus;
  created_at: string;
  updated_at: string;
}

/**
 * The AL TL's own HBPR partnership (GET partnership/). The AL TL authors the
 * evidence but cannot read the staff-only assignment API, so this is where they
 * learn who their HBPR is and what the cadence state is.
 */
export interface HbprPartnershipAssignment {
  id: number;
  hbpr: PersonRef;
  cadence: HbprCadence;
  effective_from: string;
  last_meeting_on: string | null;
  next_due_on: string | null;
  cadence_status: HbprCadenceStatus;
  epr_mid_year: boolean;
  epr_year_end: boolean;
  evidence_count: number;
  last_evidence_on: string | null;
}

export interface HbprPartnership {
  reporting_year: number;
  assignment: HbprPartnershipAssignment | null;
}

/** Create/edit payload for governance evidence (the assigned AL TL only). */
export interface HbprEvidencePayload {
  assignment: number;
  kind: HbprEvidenceKind;
  occurred_on: string;
  reporting_year?: number | null;
  shared_summary?: string;
  action_items?: string;
  reference_url?: string;
}
