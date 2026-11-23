import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";

/**
 * A higher-is-better KPI is "Watch" from this share of its target upward.
 * Mirrors `WATCH_SHARE` in `plugins/tl_scorecard/report_kpis.py` so a value
 * cannot be green on the card and amber in the export (or the reverse).
 */
const WATCH_SHARE = 0.8;

/** Every judged percentage KPI is a 100% target unless the payload says otherwise. */
const DEFAULT_TARGET = 100;

/** SLA tone for a percentage where higher is better, judged against `target`. */
export const slaTone = (pct: number | null, target = DEFAULT_TARGET) => {
  if (pct === null) return undefined;
  if (pct >= target) return toneTextClass.success;
  if (pct >= WATCH_SHARE * target) return toneTextClass.warning;
  return toneTextClass.danger;
};

/**
 * Icon-well surface echoing the same SLA thresholds (mirrors slaTone).
 * Includes the border width — the tone surface only carries the color.
 */
export const slaWell = (pct: number | null, target = DEFAULT_TARGET) => {
  if (pct === null) return `border ${toneSurfaceClass.neutral}`;
  if (pct >= target) return `border ${toneSurfaceClass.success}`;
  if (pct >= WATCH_SHARE * target) return `border ${toneSurfaceClass.warning}`;
  return `border ${toneSurfaceClass.danger}`;
};

/** Progress-bar fill echoing the same SLA thresholds (mirrors slaTone). */
export const slaBar = (pct: number | null, target = DEFAULT_TARGET) => {
  if (pct === null) return "bg-muted-foreground/40";
  if (pct >= target) return "bg-tone-success-text";
  if (pct >= WATCH_SHARE * target) return "bg-tone-warning-text";
  return "bg-tone-danger-text";
};
