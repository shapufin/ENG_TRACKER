import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { toneSurfaceClass } from "@/components/ui/tone";
import { Users2 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface TeamBreakdownTableProps {
  rows: EngagementTeamBreakdownRow[];
}

const pendingOver48h = (row: EngagementTeamBreakdownRow): number =>
  (row.metrics.leave?.pending_over_48h ?? 0) +
  (row.metrics.overtime?.pending_over_48h ?? 0) +
  (row.metrics.standby?.pending_over_48h ?? 0);

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
    <GlassCard className="overflow-hidden" delay={0}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight">Engagement by team</h3>
        <p className="text-xs text-muted-foreground">{rows.length} team(s)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
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
                Pending &gt;48h
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
                <td className="px-4 py-3 tabular-nums">{pendingOver48h(row)}</td>
                <td className="px-4 py-3 tabular-nums">{row.resubmission_count}</td>
                <td className="px-4 py-3">
                  {row.is_stale ? (
                    <span
                      role="status"
                      aria-label="Stale snapshot"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${toneSurfaceClass.warning}`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--tone-warning-text))]"
                        aria-hidden="true"
                      />
                      Stale
                    </span>
                  ) : (
                    <span
                      role="status"
                      aria-label="Fresh snapshot"
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${toneSurfaceClass.success}`}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--tone-success-text))]"
                        aria-hidden="true"
                      />
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
