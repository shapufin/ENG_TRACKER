/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Badge } from "@/components/ui/badge";

interface ReportUserTableProps {
  activeTab: "overtime_standby" | "vacation";
  data: any[];
}

// fallow-ignore-next-line complexity
const ReportUserRow: React.FC<{ activeTab: ReportUserTableProps["activeTab"]; user: any }> = ({
  activeTab,
  user: u,
}) => (
  <tr key={u.user_id} className="transition-colors hover:bg-muted/20">
    <td className="px-6 py-4">
      <div className="flex flex-col">
        <span className="font-semibold text-foreground">{u.full_name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">@{u.username}</span>
      </div>
    </td>
    <td className="px-6 py-4">
      <Badge
        variant="secondary"
        className="bg-muted text-[10px] font-bold uppercase tracking-tighter"
      >
        {u.team || "Unassigned"}
      </Badge>
    </td>
    {activeTab === "overtime_standby" ? (
      <>
        <td className="px-6 py-4 text-right font-mono">
          <span className="font-bold text-blue-600">{u.overtime?.total_hours || 0}h</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="font-bold text-green-600">{u.overtime?.approved_hours || 0}h</span>
        </td>
        <td className="px-6 py-4 text-right font-mono">
          <span className="font-bold text-purple-600">{u.standby?.total_hours || 0}h</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="font-bold text-green-600">{u.standby?.approved_hours || 0}h</span>
        </td>
      </>
    ) : (
      <td className="px-6 py-4 text-right font-mono">
        <span className="font-bold text-green-700">{u.leave?.total_days || 0}d</span>
        <span className="mx-1 text-sm text-muted-foreground">/</span>
        <span className="font-bold text-green-600">{u.leave?.approved_days || 0}d</span>
      </td>
    )}
  </tr>
);

export const ReportUserTable: React.FC<ReportUserTableProps> = ({ activeTab, data }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-6 py-4">Employee</th>
          <th className="px-6 py-4">Team</th>
          {activeTab === "overtime_standby" ? (
            <>
              <th className="px-6 py-4 text-right">Overtime (Total/Appr.)</th>
              <th className="px-6 py-4 text-right">Standby (Total/Appr.)</th>
            </>
          ) : (
            <th className="px-6 py-4 text-right">Vacation Days (Total/Appr.)</th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {data.length > 0 ? (
          data.map((u: any) => <ReportUserRow key={u.user_id} activeTab={activeTab} user={u} />)
        ) : (
          <tr>
            <td colSpan={4} className="px-6 py-20 text-center italic text-muted-foreground">
              No records found matching the specified filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);
