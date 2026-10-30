/** Mirrors `COMPONENT_WEIGHTS` in `plugins/engagement/services.py` (sum 100). */
export const SCORE_PARTS = [
  { label: "Within deadline", weight: 40, text: "Share of requests decided by their deadline." },
  { label: "Approval rate", weight: 20, text: "Share of decided requests that were approved." },
  {
    label: "Responsiveness",
    weight: 20,
    text: "How early inside the deadline window you decide; earlier scores higher.",
  },
  {
    label: "Consistency",
    weight: 20,
    text: "How steady your decision pace is from week to week.",
  },
] as const;
