/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Badge } from "@/components/ui/badge";
import { toneTextClass } from "@/components/ui/tone";
import {
  TABLE_BODY_CELL_CLASS,
  TABLE_BODY_DIVIDER_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_ROW_HOVER_CLASS,
} from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";

interface ReportUserTableProps {
  activeTab: "overtime_standby" | "vacation";
  data: any[];
}

// fallow-ignore-next-line complexity
const ReportUserRow: React.FC<{ activeTab: ReportUserTableProps["activeTab"]; user: any }> = ({
  activeTab,
  user: u,
}) => (
  <tr key={u.user_id} className={TABLE_ROW_HOVER_CLASS}>
    <td className={TABLE_BODY_CELL_CLASS}>
      <div className="flex flex-col">
        <span className="text-foreground font-semibold">{u.full_name}</span>
        <span className="text-muted-foreground font-mono text-xs">@{u.username}</span>
      </div>
    </td>
    <td className={TABLE_BODY_CELL_CLASS}>
      <Badge variant="secondary" className="bg-muted text-xs font-bold tracking-tighter uppercase">
        {u.team || "Unassigned"}
      </Badge>
    </td>
    {activeTab === "overtime_standby" ? (
      <>
        <td className={cn(TABLE_BODY_CELL_CLASS, "text-right font-mono")}>
          <span className="text-foreground font-bold">{u.overtime?.total_hours || 0}h</span>
          <span className="text-muted-foreground mx-1">/</span>
          <span className={`font-bold ${toneTextClass.success}`}>
            {u.overtime?.approved_hours || 0}h
          </span>
        </td>
        <td className={cn(TABLE_BODY_CELL_CLASS, "text-right font-mono")}>
          <span className="text-foreground font-bold">{u.standby?.total_hours || 0}h</span>
          <span className="text-muted-foreground mx-1">/</span>
          <span className={`font-bold ${toneTextClass.success}`}>
            {u.standby?.approved_hours || 0}h
          </span>
        </td>
      </>
    ) : (
      <td className={cn(TABLE_BODY_CELL_CLASS, "text-right font-mono")}>
        <span className="text-foreground font-bold">{u.leave?.total_days || 0}d</span>
        <span className="text-muted-foreground mx-1 text-sm">/</span>
        <span className={`font-bold ${toneTextClass.success}`}>{u.leave?.approved_days || 0}d</span>
      </td>
    )}
  </tr>
);

export const ReportUserTable: React.FC<ReportUserTableProps> = ({ activeTab, data }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead>
        <tr className={TABLE_HEAD_ROW_CLASS}>
          <th className={TABLE_HEAD_CELL_CLASS}>Employee</th>
          <th className={TABLE_HEAD_CELL_CLASS}>Team</th>
          {activeTab === "overtime_standby" ? (
            <>
              <th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>Overtime (Total/Appr.)</th>
              <th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>Standby (Total/Appr.)</th>
            </>
          ) : (
            <th className={cn(TABLE_HEAD_CELL_CLASS, "text-right")}>Vacation Days (Total/Appr.)</th>
          )}
        </tr>
      </thead>
      <tbody className={TABLE_BODY_DIVIDER_CLASS}>
        {data.length > 0 ? (
          data.map((u: any) => <ReportUserRow key={u.user_id} activeTab={activeTab} user={u} />)
        ) : (
          <tr>
            <td
              colSpan={activeTab === "overtime_standby" ? 4 : 3}
              className="text-muted-foreground px-6 py-20 text-center italic"
            >
              No records found matching the specified filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
