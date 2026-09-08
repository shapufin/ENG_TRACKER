/** Deterministic per-category accent tints for matrix super-headers.
 *
 * Hashes the category name into one of five accent families built from the
 * existing proficiency palette (blue / indigo / emerald / amber / rose).
 * All classes use semantic-safe opacity tints with paired light/dark text
 * (`-700` light, `-400` dark) to hold WCAG AA on `/5`–`/10` backgrounds.
 */

export interface CategoryAccent {
  /** Text color for the super-header label. */
  text: string;
  /** Subtle background tint for the super-header cell. */
  bg: string;
  /** Left divider color separating domain groups. */
  border: string;
  /** Matching text tone for the sub-header Avg value. */
  avgText: string;
}

interface AccentFamily {
  text: string;
  bg: string;
  border: string;
  avgText: string;
}

const FAMILIES: readonly AccentFamily[] = [
  {
    text: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-500/5",
    border: "border-l-blue-500/30",
    avgText: "text-blue-700 dark:text-blue-400",
  },
  {
    text: "text-indigo-700 dark:text-indigo-400",
    bg: "bg-indigo-500/5",
    border: "border-l-indigo-500/30",
    avgText: "text-indigo-700 dark:text-indigo-400",
  },
  {
    text: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-500/5",
    border: "border-l-emerald-500/30",
    avgText: "text-emerald-700 dark:text-emerald-400",
  },
  {
    text: "text-amber-700 dark:text-amber-400",
    bg: "bg-amber-500/5",
    border: "border-l-amber-500/30",
    avgText: "text-amber-700 dark:text-amber-400",
  },
  {
    text: "text-rose-700 dark:text-rose-400",
    bg: "bg-rose-500/5",
    border: "border-l-rose-500/30",
    avgText: "text-rose-700 dark:text-rose-400",
  },
] as const;

const hashName = (name: string): number => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
};

/** Deterministic accent for a category name (stable across renders/sessions). */
export const categoryAccent = (name: string): CategoryAccent =>
  FAMILIES[hashName(name) % FAMILIES.length];

/** Text tone for a sub-header Avg value, bucketed by nearest level. */
export const avgTone = (avg: number): string => {
  const bucket = Math.min(5, Math.max(1, Math.round(avg)));
  const byBucket: Record<number, string> = {
    1: "text-rose-700 dark:text-rose-400",
    2: "text-orange-700 dark:text-orange-400",
    3: "text-amber-700 dark:text-amber-400",
    4: "text-blue-700 dark:text-blue-400",
    5: "text-emerald-700 dark:text-emerald-400",
  };
  return byBucket[bucket];
};
