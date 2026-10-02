import { CADENCE_LABELS, CADENCE_STATUS_LABELS } from "@/types/hbprAssignment";
import type { HbprCadenceStatus, HbprEvidenceKind } from "../../types/tlScorecard";

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

/** `Intl` date, so a locale never gets a hand-rolled dd/mm/yyyy. */
export const formatDate = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
        new Date(`${iso}T00:00:00`)
      )
    : "—";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
