import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { toLocalISODate } from "./date-format-utils";

export interface QuickRangePreset {
  label: string;
  getRange: () => { from: string; to: string };
}

const today = () => new Date();

export const DEFAULT_QUICK_RANGES: QuickRangePreset[] = [
  {
    label: "Today",
    getRange: () => {
      const iso = toLocalISODate(today());
      return { from: iso, to: iso };
    },
  },
  {
    label: "This week",
    getRange: () => ({
      from: toLocalISODate(startOfWeek(today())),
      to: toLocalISODate(endOfWeek(today())),
    }),
  },
  {
    label: "This month",
    getRange: () => ({
      from: toLocalISODate(startOfMonth(today())),
      to: toLocalISODate(endOfMonth(today())),
    }),
  },
  {
    label: "Last month",
    getRange: () => {
      const lastMonth = subMonths(today(), 1);
      return {
        from: toLocalISODate(startOfMonth(lastMonth)),
        to: toLocalISODate(endOfMonth(lastMonth)),
      };
    },
  },
  {
    label: "Last 7 days",
    getRange: () => ({ from: toLocalISODate(subDays(today(), 6)), to: toLocalISODate(today()) }),
  },
  {
    label: "Last 30 days",
    getRange: () => ({ from: toLocalISODate(subDays(today(), 29)), to: toLocalISODate(today()) }),
  },
  {
    label: "This quarter",
    getRange: () => ({
      from: toLocalISODate(startOfQuarter(today())),
      to: toLocalISODate(endOfQuarter(today())),
    }),
  },
  {
    label: "This year",
    getRange: () => ({
      from: toLocalISODate(startOfYear(today())),
      to: toLocalISODate(endOfYear(today())),
    }),
  },
];
