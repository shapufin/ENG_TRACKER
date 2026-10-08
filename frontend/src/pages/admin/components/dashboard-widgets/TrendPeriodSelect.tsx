import React from "react";
import { cn } from "@/lib/utils";
import { TREND_PERIODS, type TrendPeriod } from "./trendTypes";

interface TrendPeriodSelectProps {
  value: TrendPeriod;
  onChange: (next: TrendPeriod) => void;
}

/** Month window for the trend charts. */
export const TrendPeriodSelect: React.FC<TrendPeriodSelectProps> = ({ value, onChange }) => (
  <div role="group" aria-label="Trend period" className="flex items-center gap-1">
    <span className="text-muted-foreground mr-1 text-xs">Period</span>
    {TREND_PERIODS.map((p) => (
      <button
        key={p}
        type="button"
        aria-label={`${p} months`}
        aria-pressed={value === p}
        onClick={() => onChange(p)}
        className={cn(
          "inline-flex min-h-6 min-w-9 items-center justify-center rounded-md border px-2 font-mono text-xs",
          value === p
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border text-muted-foreground hover:bg-accent"
        )}
      >
        {p}m
      </button>
    ))}
  </div>
);
