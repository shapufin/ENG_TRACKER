import React from "react";
import { Building2 } from "lucide-react";
import { fmt1 } from "./chartStyle";
import { cn } from "@/lib/utils";
import { TABLE_HEAD_CELL_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/ui/tableStyles";
import { WidgetFrame } from "./WidgetFrame";
import type { TrendWidgetProps } from "./trendTypes";

export const TeamComparisonWidget: React.FC<TrendWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const rows = data?.team_comparison ?? [];
  return (
    <WidgetFrame
      title="Team Comparison"
      description="This month, approved hours and business days"
      className="lg:col-span-2"
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      empty={rows.length === 0 ? { icon: Building2, title: "No teams yet" } : null}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2")}>
                Team
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Size
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                OT h
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                OT / person
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Standby h
              </th>
              <th scope="col" className={cn(TABLE_HEAD_CELL_CLASS, "px-2 py-2 text-right")}>
                Leave d
              </th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((t) => (
              <tr key={t.team_id} className="border-border/50 border-t">
                <th scope="row" className="px-2 py-2 text-left font-sans font-medium">
                  {t.name}
                </th>
                <td className="px-2 py-2 text-right">{t.team_size}</td>
                <td className="px-2 py-2 text-right">{fmt1(t.overtime_hours)}</td>
                <td className="px-2 py-2 text-right">
                  {t.overtime_per_capita === null ? "—" : fmt1(t.overtime_per_capita)}
                </td>
                <td className="px-2 py-2 text-right">{fmt1(t.standby_hours)}</td>
                <td className="px-2 py-2 text-right">{fmt1(t.leave_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  );
};
