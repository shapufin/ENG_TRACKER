import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";

export type PeriodPreset = "this_month" | "last_month" | "this_quarter" | "ytd";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
];

const pad = (n: number) => String(n).padStart(2, "0");
// Local calendar date; toISOString would shift across the UTC boundary.
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// eslint-disable-next-line react-refresh/only-export-components -- exported beside the component per the task interface
export function presetRange(preset: PeriodPreset, today: Date): { start: string; end: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "this_month":
      return { start: ymd(new Date(y, m, 1)), end: ymd(new Date(y, m + 1, 0)) };
    case "last_month":
      return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m, 0)) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: ymd(new Date(y, q, 1)), end: ymd(new Date(y, q + 3, 0)) };
    }
    case "ytd":
      return { start: ymd(new Date(y, 0, 1)), end: ymd(today) };
  }
}

interface ReportPeriodPresetsProps {
  start: string;
  end: string;
  onSelect(range: { start: string; end: string }): void;
}

export const ReportPeriodPresets: React.FC<ReportPeriodPresetsProps> = ({
  start,
  end,
  onSelect,
}) => {
  const today = new Date();
  const active = PRESETS.find((p) => {
    const r = presetRange(p.value, today);
    return r.start === start && r.end === end;
  });
  return (
    <FilterChipRow<PeriodPreset>
      label="Period"
      options={PRESETS}
      selected={active ? [active.value] : []}
      onToggle={(value) => onSelect(presetRange(value, today))}
    />
  );
};
