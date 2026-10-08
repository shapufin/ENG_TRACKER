import {
  CalendarDays,
  Clock,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS } from "@/types/hbprAssignment";
import type { HbprCadenceStatus, HbprEvidenceKind } from "../../types/tlScorecard";
import type { HbprRecordResource } from "../../hooks/useHbprWorkspaceQueries";
import type { Tone } from "@/components/ui/tone";

export { CADENCE_LABELS, CADENCE_STATUS_LABELS };

/** Tone token per cadence state, so a badge colour is never chosen ad hoc. */
export const CADENCE_STATUS_TONE: Record<
  HbprCadenceStatus,
  "success" | "warning" | "destructive" | "neutral"
> = {
  on_track: "success",
  due: "warning",
  overdue: "destructive",
  not_started: "neutral",
  ended: "neutral",
};

export const EVIDENCE_KIND_LABELS: Record<HbprEvidenceKind, string> = {
  cadence_meeting: "Cadence meeting",
  epr_mid_year: "EPR mid-year participation",
  epr_year_end: "EPR year-end participation",
};

/** Badge variant per evidence kind, so both timelines colour them identically. */
export const EVIDENCE_KIND_TONE: Record<HbprEvidenceKind, "info" | "accent" | "success"> = {
  cadence_meeting: "info",
  epr_mid_year: "accent",
  epr_year_end: "success",
};

/** Display order of the kinds wherever evidence is separated by type. */
export const EVIDENCE_KIND_ORDER: readonly HbprEvidenceKind[] = [
  "cadence_meeting",
  "epr_mid_year",
  "epr_year_end",
];

/** Plural section/filter names (the singular labels above name one row). */
export const EVIDENCE_KIND_GROUP_LABELS: Record<HbprEvidenceKind, string> = {
  cadence_meeting: "Cadence meetings",
  epr_mid_year: "Mid-year EPR",
  epr_year_end: "Year-end EPR",
};

/** `Intl` date, so a locale never gets a hand-rolled dd/mm/yyyy. */
export const formatDate = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(`${iso}T00:00:00`)
      )
    : "—";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Sidebar icon + tone per record category (mirrors the TL reference mockup). */
export const HBPR_RESOURCE_ICONS: Record<HbprRecordResource, { icon: LucideIcon; tone: Tone }> = {
  meetings: { icon: Users, tone: "success" },
  "idle-flags": { icon: Clock, tone: "warning" },
  absences: { icon: CalendarDays, tone: "info" },
  "review-deliveries": { icon: ShieldCheck, tone: "accent" },
  "pip-records": { icon: TriangleAlert, tone: "danger" },
  "promotion-flags": { icon: TrendingUp, tone: "success" },
};

/** Singular noun per record category, for snippet headers and history links. */
export const HBPR_RESOURCE_NOUNS: Record<HbprRecordResource, string> = {
  meetings: "meeting",
  "idle-flags": "idle flag",
  absences: "absence",
  "review-deliveries": "review delivery",
  "pip-records": "PIP",
  "promotion-flags": "promotion nomination",
};
