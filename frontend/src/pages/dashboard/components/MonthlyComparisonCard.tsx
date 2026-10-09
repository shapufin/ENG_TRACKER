import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { MonthlyComparisonData } from "@/types";
import { TrendIndicator } from "./TrendIndicator";

interface MonthlyComparisonCardProps {
  data?: MonthlyComparisonData;
  granularity?: "week" | "month";
  onGranularityChange?: (granularity: "week" | "month") => void;
}

const BarChart: React.FC<{
  current: number;
  previous: number;
  currentLabel?: string;
  previousLabel?: string;
}> = ({ current, previous, currentLabel = "Curr", previousLabel = "Prev" }) => {
  const maxValue = Math.max(current, previous, 1);
  const prevHeight = Math.max(8, (previous / maxValue) * 160);
  const currHeight = Math.max(8, (current / maxValue) * 160);

  return (
    <div className="flex items-end justify-center gap-8 py-4">
      <div className="flex flex-col items-center gap-2">
        <div className="bg-muted/30 w-24 rounded-t-xl" style={{ height: `${prevHeight}px` }} />
        <span className="text-base font-semibold tabular-nums">{previous}</span>
        <span className="text-muted-foreground">{previousLabel}</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div
          className="bg-primary/20 relative flex w-24 items-end overflow-hidden rounded-t-2xl"
          style={{ height: `${currHeight}px` }}
        >
          <div className="from-primary to-primary/60 h-full w-full rounded-t-2xl bg-linear-to-t shadow-[0_0_40px_hsl(var(--primary)/0.45)]" />
        </div>
        <span className="text-base font-semibold tabular-nums">{current}</span>
        <span className="text-muted-foreground">{currentLabel}</span>
      </div>
    </div>
  );
};

export const MonthlyComparisonCard: React.FC<MonthlyComparisonCardProps> = ({
  data,
  granularity = "month",
  onGranularityChange,
}) => (
  <GlassCard>
    <div className="flex items-start justify-between gap-3 p-6 pb-0">
      <div>
        <h3 className="text-xl font-semibold">Monthly Comparison</h3>
        <p className="text-muted-foreground">Current vs previous month pending approvals</p>
      </div>
      {onGranularityChange && (
        <div className="border-border/60 flex shrink-0 items-center gap-1 rounded-full border p-1">
          <button
            type="button"
            onClick={() => onGranularityChange("month")}
            className={`rounded-full px-3 py-1 text-sm ${
              granularity === "month" ? "bg-primary/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Months
          </button>
          <button
            type="button"
            onClick={() => onGranularityChange("week")}
            className={`rounded-full px-3 py-1 text-sm ${
              granularity === "week" ? "bg-primary/10 text-foreground" : "text-muted-foreground"
            }`}
          >
            Weeks
          </button>
        </div>
      )}
    </div>
    <div className="space-y-4 p-6">
      <TrendIndicator
        trend={data?.comparison?.trend}
        percentChange={data?.comparison?.percent_change}
      />
      <BarChart
        current={data?.current_month.data.total ?? 0}
        previous={data?.previous_month.data.total ?? 0}
        currentLabel={data?.current_month.month_name}
        previousLabel={data?.previous_month.month_name}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="border-border bg-card rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">
            {data?.previous_month.month_name ?? "Prev"} daily avg
          </p>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {data?.previous_month.daily_average ?? 0}
          </div>
        </div>
        <div className="border-primary/10 bg-primary/[0.04] rounded-xl border p-4">
          <p className="text-muted-foreground text-sm">
            {data?.current_month.month_name ?? "Curr"} daily avg
          </p>
          <div className="text-primary mt-1 font-mono text-2xl font-semibold tabular-nums">
            {data?.current_month.daily_average ?? 0}
          </div>
        </div>
      </div>
    </div>
  </GlassCard>
);
