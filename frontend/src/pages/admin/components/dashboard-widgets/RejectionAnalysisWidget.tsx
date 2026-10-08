import React from "react";
import { ThumbsDown } from "lucide-react";
import { WidgetFrame } from "./WidgetFrame";
import type { PeopleWidgetProps } from "./trendTypes";

export const RejectionAnalysisWidget: React.FC<PeopleWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const rej = data?.rejections;
  const types: [string, number][] = rej
    ? [
        ["Overtime", rej.by_type.overtime],
        ["Standby", rej.by_type.standby],
        ["Leave", rej.by_type.leave],
      ]
    : [];
  const total = types.reduce((s, [, n]) => s + n, 0);
  return (
    <WidgetFrame
      sectionId="rejection-analysis"
      title="Rejection Analysis"
      description={rej ? `Rejected in ${rej.month}` : undefined}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={total === 0 ? { icon: ThumbsDown, title: "No rejections this month" } : null}
    >
      <div className="space-y-4 text-xs">
        <ul className="space-y-1.5">
          {types.map(([label, n]) => (
            <li key={label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
        {rej && rej.top_reasons.length > 0 && (
          <section aria-label="Top rejection reasons">
            <h4 className="text-muted-foreground mb-1 font-semibold tracking-wider uppercase">
              Top reasons
            </h4>
            <ul className="space-y-1">
              {rej.top_reasons.map((r) => (
                <li key={r.reason} className="flex justify-between gap-2">
                  <span className="truncate">{r.reason}</span>
                  <span className="font-mono tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </WidgetFrame>
  );
};
