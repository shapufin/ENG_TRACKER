import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { MonthlyComparisonData } from "@/types";
import { TrendIndicator } from "./TrendIndicator";

interface MonthlyComparisonCardProps {
  data?: MonthlyComparisonData;
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
        <div className="w-24 rounded-t-xl bg-muted/30" style={{ height: `${prevHeight}px` }} />
        <span className="text-base font-semibold">{previous}</span>
        <span className="text-muted-foreground">{previousLabel}</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative flex items-end overflow-hidden rounded-t-2xl bg-primary/20"
          style={{ height: `${currHeight}px`, width: "96px" }}
        >
          <div className="h-full w-full rounded-t-2xl bg-gradient-to-t from-primary to-primary/60 shadow-[0_0_40px_hsl(var(--primary)/0.45)]" />
        </div>
        <span className="text-base font-semibold">{current}</span>
        <span className="text-muted-foreground">{currentLabel}</span>
      </div>
    </div>
  );
};

export const MonthlyComparisonCard: React.FC<MonthlyComparisonCardProps> = ({ data }) => (
  <GlassCard>
    <div className="p-6 pb-0">
      <h3 className="text-xl font-semibold">Monthly Comparison</h3>
      <p className="text-muted-foreground">Current vs previous month pending approvals</p>
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
        <div className="rounded-xl border border-border/30 bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            {data?.previous_month.month_name ?? "Prev"} daily avg
          </p>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {data?.previous_month.daily_average ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-primary/10 bg-primary/[0.04] p-4">
          <p className="text-sm text-muted-foreground">
            {data?.current_month.month_name ?? "Curr"} daily avg
          </p>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-primary">
            {data?.current_month.daily_average ?? 0}
          </div>
        </div>
      </div>
    </div>
  </GlassCard>
);
