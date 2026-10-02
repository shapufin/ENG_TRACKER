import { toneTextClass } from "@/components/ui/tone";

/** SLA tone for a percentage where higher is better. */
export const slaTone = (pct: number | null) => {
  if (pct === null) return undefined;
  if (pct >= 90) return toneTextClass.success;
  if (pct >= 70) return toneTextClass.warning;
  return toneTextClass.danger;
};
