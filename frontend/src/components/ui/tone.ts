/**
 * Semantic tone scale. The single source of truth for tinted status surfaces.
 * Prefer these over raw palette classes (`bg-emerald-500/15`,
 * `text-rose-700 dark:text-rose-400`, ...) — the tokens already handle the
 * light/dark text swap, so no `dark:` variant is needed at the callsite.
 */
export const TONES = ["success", "warning", "danger", "info", "accent", "neutral"] as const;

export type Tone = (typeof TONES)[number];

/** Tinted surface + border + readable text, for wells, callouts and pills. */
export const toneSurfaceClass: Record<Tone, string> = {
  success: "border-tone-success-border bg-tone-success-surface text-tone-success-text",
  warning: "border-tone-warning-border bg-tone-warning-surface text-tone-warning-text",
  danger: "border-tone-danger-border bg-tone-danger-surface text-tone-danger-text",
  info: "border-tone-info-border bg-tone-info-surface text-tone-info-text",
  accent: "border-tone-accent-border bg-tone-accent-surface text-tone-accent-text",
  neutral: "border-tone-neutral-border bg-tone-neutral-surface text-tone-neutral-text",
};

/** Text colour only, for values and inline emphasis on an untinted surface. */
export const toneTextClass: Record<Tone, string> = {
  success: "text-tone-success-text",
  warning: "text-tone-warning-text",
  danger: "text-tone-danger-text",
  info: "text-tone-info-text",
  accent: "text-tone-accent-text",
  neutral: "text-tone-neutral-text",
};
