import React from "react";
import { Briefcase } from "lucide-react";
import { fmt1 } from "./chartStyle";
import { WidgetFrame } from "./WidgetFrame";
import type { TrendWidgetProps } from "./trendTypes";

export const OtByClientWidget: React.FC<TrendWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const rows = data?.overtime_by_client ?? [];
  return (
    <WidgetFrame
      title="Overtime by Client"
      description="Approved hours this month"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={rows.length === 0 ? { icon: Briefcase, title: "No overtime this month" } : null}
    >
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.client_id ?? r.name} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">{r.name}</span>
              <span className="text-muted-foreground font-mono tabular-nums">
                {fmt1(r.hours)}h · {fmt1(r.share_pct)}%
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${Math.min(100, r.share_pct)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
};
