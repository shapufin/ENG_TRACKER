import React from "react";
import { Ban, CheckCircle2, CircleDot, Clock, type LucideIcon } from "lucide-react";
import type { Tone } from "@/components/ui/tone";
import { tlScorecardService, type RecordResource } from "../../services/tlScorecardService";
import type {
  Absence,
  IdleFlag,
  Meeting,
  PIPRecord,
  PromotionFlag,
  ReviewDelivery,
} from "../../types/tlScorecard";

export const RECORD_KINDS = [
  "meetings",
  "idle",
  "absences",
  "reviews",
  "promotions",
  "pips",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const DEFAULT_KIND: RecordKind = "meetings";

export const parseKind = (raw: string | null): RecordKind =>
  RECORD_KINDS.find((kind) => kind === raw) ?? DEFAULT_KIND;

export type RecordActionId =
  | "edit"
  | "delete"
  | "share"
  | "resolve"
  | "address"
  | "approve"
  | "reject"
  | "complete"
  | "cancel"
  | "promote"
  | "decline";

export const ACTION_LABELS: Record<RecordActionId, string> = {
  edit: "Edit",
  delete: "Delete",
  share: "Share summary",
  resolve: "Mark resolved",
  address: "Mark addressed",
  approve: "Approve",
  reject: "Return to team leader",
  complete: "Complete",
  cancel: "Cancel plan",
  promote: "Promote",
  decline: "Decline",
};

export interface RecordRow {
  id: number;
}

export interface Viewer {
  userId: number | null;
  isStaff: boolean;
  /** HBPR or staff: may approve/return PIPs and decide promotions (the server re-checks). */
  /** Staff/superuser only — the API gates approve/reject/decide on that. */
  canReview: boolean;
}

interface RecordState {
  label: string;
  tone: Tone;
  icon: LucideIcon;
}

export interface KindConfig<T extends RecordRow> {
  key: RecordKind;
  label: string;
  noun: string;
  resource: RecordResource;
  fetch: () => Promise<T[]>;
  ownerId: (r: T) => number | null;
  date: (r: T) => string;
  title: (r: T) => string;
  columns: { header: string; cell: (r: T) => React.ReactNode }[];
  state: (r: T) => RecordState;
  actions: (r: T, viewer: Viewer) => RecordActionId[];
}

const define = <T extends RecordRow>(config: KindConfig<T>) =>
  config as unknown as KindConfig<RecordRow>;

const name = (value: string | null) => value ?? "Unknown";
const MEETING_LABELS = {
  one_on_one: "1-on-1",
  tl_sync: "TL sync",
  team_meeting: "Team meeting",
} as const;

const owns = (viewer: Viewer, ownerId: number | null) =>
  viewer.userId !== null && viewer.userId === ownerId;
const canManage = (viewer: Viewer, ownerId: number | null) =>
  viewer.isStaff || owns(viewer, ownerId);

const DAY_MS = 86_400_000;
export const daysOpen = (isoDate: string, now = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - new Date(`${isoDate}T00:00:00`).getTime()) / DAY_MS));

const PIP_STATES: Record<PIPRecord["status"], RecordState> = {
  draft: { label: "Pending approval", tone: "warning", icon: Clock },
  active: { label: "Active", tone: "info", icon: CircleDot },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "neutral", icon: Ban },
};

export const RECORD_CONFIGS: KindConfig<RecordRow>[] = [
  define<Meeting>({
    key: "meetings",
    label: "Meetings",
    noun: "meeting",
    resource: "meetings",
    fetch: () => tlScorecardService.listMeetings(),
    ownerId: (r) => r.organizer,
    date: (r) => r.occurred_on,
    title: (r) => `${MEETING_LABELS[r.meeting_type]} on ${r.occurred_on}`,
    columns: [
      { header: "Date", cell: (r) => r.occurred_on },
      { header: "Type", cell: (r) => MEETING_LABELS[r.meeting_type] },
      { header: "With", cell: (r) => r.counterparty_name ?? "Whole team" },
    ],
    state: (r) =>
      r.shared_at
        ? { label: "Summary shared", tone: "success", icon: CheckCircle2 }
        : { label: "Not shared", tone: "neutral", icon: CircleDot },
    actions: (r, v) => (canManage(v, r.organizer) ? ["edit", "share", "delete"] : []),
  }),
  define<IdleFlag>({
    key: "idle",
    label: "Idle flags",
    noun: "idle flag",
    resource: "idle-flags",
    fetch: () => tlScorecardService.listIdleFlags(),
    ownerId: (r) => r.flagged_by,
    date: (r) => r.flagged_on,
    title: (r) => `Idle flag for ${name(r.employee_name)}`,
    columns: [
      { header: "Team member", cell: (r) => name(r.employee_name) },
      { header: "Flagged on", cell: (r) => r.flagged_on },
      { header: "Task", cell: (r) => r.productivity_task || "—" },
    ],
    state: (r) =>
      r.status === "resolved"
        ? { label: "Resolved", tone: "success", icon: CheckCircle2 }
        : { label: "Open", tone: "warning", icon: Clock },
    actions: (r, v) =>
      canManage(v, r.flagged_by)
        ? r.status === "open"
          ? ["edit", "resolve", "delete"]
          : ["edit", "delete"]
        : [],
  }),
  define<Absence>({
    key: "absences",
    label: "Absences",
    noun: "absence",
    resource: "absences",
    fetch: () => tlScorecardService.listAbsences(),
    ownerId: (r) => r.flagged_by,
    date: (r) => r.absence_date,
    title: (r) => `Absence of ${name(r.employee_name)} on ${r.absence_date}`,
    columns: [
      { header: "Team member", cell: (r) => name(r.employee_name) },
      { header: "Date", cell: (r) => r.absence_date },
      { header: "Reason", cell: (r) => r.reason || "—" },
    ],
    state: (r) => {
      if (r.addressed_on) return { label: "Addressed", tone: "success", icon: CheckCircle2 };
      const days = daysOpen(r.absence_date);
      return days >= 5
        ? { label: "5+ days open", tone: "danger", icon: Clock }
        : { label: `${days} day${days === 1 ? "" : "s"} open`, tone: "warning", icon: Clock };
    },
    actions: (r, v) =>
      canManage(v, r.flagged_by)
        ? r.addressed_on
          ? ["edit", "delete"]
          : ["edit", "address", "delete"]
        : [],
  }),
  define<ReviewDelivery>({
    key: "reviews",
    label: "Reviews",
    noun: "review delivery",
    resource: "review-deliveries",
    fetch: () => tlScorecardService.listReviewDeliveries(),
    ownerId: (r) => r.leader,
    date: (r) => r.delivered_on,
    title: (r) => `Review for ${r.recipient} (${r.period})`,
    columns: [
      { header: "Period", cell: (r) => r.period },
      { header: "Recipient", cell: (r) => r.recipient },
      { header: "Delivered on", cell: (r) => r.delivered_on },
    ],
    state: () => ({ label: "Delivered", tone: "success", icon: CheckCircle2 }),
    actions: (r, v) => (canManage(v, r.leader) ? ["edit", "delete"] : []),
  }),
  define<PromotionFlag>({
    key: "promotions",
    label: "Promotions",
    noun: "promotion nomination",
    resource: "promotion-flags",
    fetch: () => tlScorecardService.listPromotionFlags(),
    ownerId: (r) => r.nominated_by,
    date: (r) => r.nominated_on,
    title: (r) => `Promotion nomination for ${name(r.employee_name)}`,
    columns: [
      { header: "Team member", cell: (r) => name(r.employee_name) },
      { header: "Nominated on", cell: (r) => r.nominated_on },
      { header: "Nominated by", cell: (r) => name(r.nominated_by_name) },
    ],
    state: (r) => {
      if (r.status === "promoted")
        return { label: "Promoted", tone: "success", icon: CheckCircle2 };
      if (r.status === "declined") return { label: "Declined", tone: "neutral", icon: Ban };
      return { label: "Awaiting decision", tone: "warning", icon: Clock };
    },
    actions: (r, v) => {
      const own = canManage(v, r.nominated_by) ? (["edit", "delete"] as RecordActionId[]) : [];
      const decide =
        v.canReview && !owns(v, r.nominated_by) && r.status === "nominated"
          ? (["promote", "decline"] as RecordActionId[])
          : [];
      return [...decide, ...own];
    },
  }),
  define<PIPRecord>({
    key: "pips",
    label: "PIPs",
    noun: "PIP",
    resource: "pip-records",
    fetch: () => tlScorecardService.listPIPRecords(),
    ownerId: (r) => r.tl,
    date: (r) => r.start_date,
    title: (r) => `PIP for ${name(r.employee_name)}`,
    columns: [
      { header: "Team member", cell: (r) => name(r.employee_name) },
      { header: "Started", cell: (r) => r.start_date },
      { header: "Team leader", cell: (r) => name(r.tl_name) },
    ],
    state: (r) => PIP_STATES[r.status],
    actions: (r, v) => {
      const manage = canManage(v, r.tl);
      const review =
        v.canReview && !owns(v, r.tl) && r.status === "draft"
          ? (["approve", "reject"] as RecordActionId[])
          : [];
      const close =
        manage && r.status === "active" ? (["complete", "cancel"] as RecordActionId[]) : [];
      return [...review, ...close, ...(manage ? (["edit", "delete"] as RecordActionId[]) : [])];
    },
  }),
];
