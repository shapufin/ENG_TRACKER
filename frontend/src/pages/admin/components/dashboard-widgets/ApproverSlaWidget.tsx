import React from "react";
import { Gauge } from "lucide-react";
import { fmt1 } from "./chartStyle";
import { WidgetFrame } from "./WidgetFrame";
import type { PeopleWidgetProps } from "./trendTypes";

const TH = "pb-2 text-right font-semibold";

export const ApproverSlaWidget: React.FC<PeopleWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const rows = data?.approver_sla ?? [];
  return (
    <WidgetFrame
      title="Approver Speed"
      description="Decisions in the last 30 days, most active first"
      className="lg:col-span-2"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={rows.length === 0 ? { icon: Gauge, title: "No decisions in the last 30 days" } : null}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th scope="col" className="pb-2 font-semibold">
                Approver
              </th>
              <th scope="col" className={TH}>
                Decisions
              </th>
              <th scope="col" className={TH}>
                Approved
              </th>
              <th scope="col" className={TH}>
                Avg time
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((a) => (
              <tr key={a.user_id} className="border-border/50 border-t">
                <th scope="row" className="py-2 text-left font-sans font-medium">
                  {a.name}
                </th>
                <td className="py-2 text-right">{a.decisions_30d}</td>
                <td className="py-2 text-right">{fmt1(a.approval_rate_pct)}%</td>
                <td className="py-2 text-right">{fmt1(a.avg_decision_hours)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
};
