import type { CalendarEvent } from "./types";

export const calendarSurface =
  "rounded-2xl border border-border/70 bg-card/95 text-card-foreground backdrop-blur-xl";

export const calendarGridHeader = "border-b border-line-subtle bg-surface-sunken";
export const calendarRowDivider = "border-line-subtle";

type CalendarTone = {
  surface: string;
  title: string;
  meta: string;
  chip: string;
  badge: string;
};

// NOTE: every class string below must be a COMPLETE literal — Tailwind's JIT
// scanner cannot see classes constructed dynamically (plan §5 precision rule).
export const calendarEventTypeStyles: Record<CalendarEvent["type"], CalendarTone> = {
  vacation: {
    surface: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40",
    title: "text-emerald-700 dark:text-emerald-300",
    meta: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/25 text-emerald-900 dark:bg-emerald-500/30 dark:text-white",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  sick: {
    surface: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/40",
    title: "text-rose-700 dark:text-rose-300",
    meta: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/25 text-rose-900 dark:bg-rose-500/30 dark:text-white",
    badge: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  standby: {
    surface: "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-950/30",
    title: "text-amber-700 dark:text-amber-300",
    meta: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/25 text-amber-900 dark:bg-amber-500/30 dark:text-white",
    badge: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  holiday: {
    surface: "border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-950/40",
    title: "text-sky-700 dark:text-sky-300",
    meta: "text-sky-600 dark:text-sky-400",
    chip: "bg-sky-500/25 text-sky-900 dark:bg-sky-500/30 dark:text-white",
    badge: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
};

export const calendarEventStatusStyles: Record<CalendarEvent["status"], CalendarTone> = {
  pending: {
    surface: "border-orange-200 bg-orange-50 dark:border-orange-500/30 dark:bg-orange-950/40",
    title: "text-orange-700 dark:text-orange-300",
    meta: "text-orange-600 dark:text-orange-400",
    chip: "bg-orange-500/25 text-orange-900 dark:bg-orange-500/30 dark:text-white",
    badge: "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  approved: {
    surface: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40",
    title: "text-emerald-700 dark:text-emerald-300",
    meta: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/25 text-emerald-900 dark:bg-emerald-500/30 dark:text-white",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  rejected: {
    surface: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-950/40",
    title: "text-rose-700 dark:text-rose-300",
    meta: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/25 text-rose-900 dark:bg-rose-500/30 dark:text-white",
    badge: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};
