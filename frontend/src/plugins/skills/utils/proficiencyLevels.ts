/** Proficiency level definitions (1-5 scale) — theme-safe tinted colors. */

import type { SkillLevelLabels } from "../types/skills";

export interface ProficiencyDefinition {
  level: number;
  label: string;
  /** Combined bg + text + border classes (opacity-tinted with dark: variants). */
  color: string;
  /** Solid color class for the dot swatch / legend. */
  dot: string;
  /** Heatmap cell color — softer than dot, with ring for cell definition. */
  heat: string;
}

export const PROFICIENCY_LEVELS: readonly ProficiencyDefinition[] = [
  {
    level: 1,
    label: "Foundational",
    color: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
    dot: "bg-rose-500",
    heat: "bg-rose-400/80 dark:bg-rose-500/70 ring-1 ring-inset ring-rose-500/30 dark:ring-rose-400/20",
  },
  {
    level: 2,
    label: "Developing",
    color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/40",
    dot: "bg-orange-500",
    heat: "bg-orange-400/80 dark:bg-orange-500/70 ring-1 ring-inset ring-orange-500/30 dark:ring-orange-400/20",
  },
  {
    level: 3,
    label: "Proficient",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
    dot: "bg-amber-500",
    heat: "bg-amber-400/80 dark:bg-amber-500/70 ring-1 ring-inset ring-amber-500/30 dark:ring-amber-400/20",
  },
  {
    level: 4,
    label: "Advanced",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/40",
    dot: "bg-blue-500",
    heat: "bg-blue-400/80 dark:bg-blue-500/70 ring-1 ring-inset ring-blue-500/30 dark:ring-blue-400/20",
  },
  {
    level: 5,
    label: "Mastery",
    color: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/50",
    dot: "bg-emerald-500",
    heat: "bg-emerald-400/80 dark:bg-emerald-500/70 ring-1 ring-inset ring-emerald-500/30 dark:ring-emerald-400/20",
  },
] as const;

const LEVEL_LABEL_FIELDS = {
  1: "level_1_label",
  2: "level_2_label",
  3: "level_3_label",
  4: "level_4_label",
  5: "level_5_label",
} as const;

/**
 * Resolve a proficiency level's display label, preferring the admin-set custom
 * name and falling back to the hardcoded default (fail-open — never renders
 * blank while the labels are loading or if the fetch fails).
 *
 * Pure so it can be reused inside a `.map()` without a hook per iteration, and
 * so non-React code (KPI computation) can honour the custom names too: fetch
 * `labels` once via `useSkillLevelLabels()` and pass them in. Anything that
 * renders a level name MUST go through here — a second hardcoded label map is
 * how the My Skills picker and the seniority KPI kept showing the defaults
 * after an admin renamed a level.
 */
export const resolveLevelLabel = (level: number, labels?: SkillLevelLabels): string => {
  const field = LEVEL_LABEL_FIELDS[level as keyof typeof LEVEL_LABEL_FIELDS];
  const custom = field && labels ? labels[field] : undefined;
  if (custom && custom.trim()) return custom;
  const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
  return entry ? entry.label : `L${level}`;
};

/** Default label only — prefer `resolveLevelLabel` so custom names are honoured. */
export const levelLabel = (level: number): string => resolveLevelLabel(level);

export const levelColor = (level: number): string => {
  const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
  return entry ? entry.color : "bg-muted text-muted-foreground border-border";
};

export const levelDot = (level: number): string => {
  const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
  return entry ? entry.dot : "bg-muted-foreground";
};

export const levelHeat = (level: number): string => {
  const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
  return entry ? entry.heat : "bg-muted/20 ring-1 ring-inset ring-border/50";
};
