import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";

/** SLA tone for a percentage where higher is better. */
export const slaTone = (pct: number | null) => {
  if (pct === null) return undefined;
  if (pct >= 90) return toneTextClass.success;
  if (pct >= 70) return toneTextClass.warning;
  return toneTextClass.danger;
};

/**
 * Icon-well surface echoing the same SLA thresholds (mirrors slaTone).
 * Includes the border width — the tone surface only carries the color.
 */
export const slaWell = (pct: number | null) => {
  if (pct === null) return `border ${toneSurfaceClass.neutral}`;
  if (pct >= 90) return `border ${toneSurfaceClass.success}`;
  if (pct >= 70) return `border ${toneSurfaceClass.warning}`;
  return `border ${toneSurfaceClass.danger}`;
};
