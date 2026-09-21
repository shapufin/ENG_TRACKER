import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users2 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface TeamBreakdownTableProps {
  rows: EngagementTeamBreakdownRow[];
}

export const TeamBreakdownTable: React.FC<TeamBreakdownTableProps> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <GlassCard>
        <EmptyState
          icon={Users2}
          title="No teams to show"
          description="Team breakdown appears once metrics have been computed for your teams."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Engagement metrics by team</caption>
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                Team
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Leader
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Size
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Score
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Approval Rate
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Resubmissions
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-medium">{row.team_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.leader_name}</td>
                <td className="px-4 py-3 tabular-nums">{row.team_size}</td>
                <td className="px-4 py-3 tabular-nums">
                  {row.engagement_score !== null ? row.engagement_score.toFixed(0) : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.approval_rate_pct !== null ? `${row.approval_rate_pct.toFixed(0)}%` : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">{row.resubmission_count}</td>
                <td className="px-4 py-3">
                  {row.is_stale ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
                      Stale
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                      Fresh
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
};
