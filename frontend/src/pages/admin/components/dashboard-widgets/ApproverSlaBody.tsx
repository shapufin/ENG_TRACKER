import React from "react";
import { Gauge } from "lucide-react";
import { fmt1 } from "./chartStyle";
import { cn } from "@/lib/utils";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { WidgetBody } from "./WidgetBody";
import type { PeopleWidgetProps } from "./trendTypes";

export const ApproverSlaBody: React.FC<PeopleWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const rows = data?.approver_sla ?? [];
  return (
    <WidgetBody
      title="Approver speed"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={rows.length === 0 ? { icon: Gauge, title: "No decisions in the last 30 days" } : null}
    >
      <p className="text-muted-foreground mb-2 text-xs">
        Decisions in the last 30 days, most active first
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2")}>
                Approver
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Decisions
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Approved
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Avg time
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((a) => (
              <tr key={a.user_id} className="border-border/50 border-t">
                <th scope="row" className="px-2 py-2 text-left font-sans font-medium">
                  {a.name}
                </th>
                <td className="px-2 py-2 text-right">{a.decisions_30d}</td>
                <td className="px-2 py-2 text-right">{fmt1(a.approval_rate_pct)}%</td>
                <td className="px-2 py-2 text-right">{fmt1(a.avg_decision_hours)}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetBody>
  );
};
