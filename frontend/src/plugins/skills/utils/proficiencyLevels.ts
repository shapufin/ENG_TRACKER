/** Proficiency level definitions (1-5 scale) — theme-safe tinted colors. */

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

export const levelLabel = (level: number): string => {
  const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
  return entry ? entry.label : `L${level}`;
};

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
