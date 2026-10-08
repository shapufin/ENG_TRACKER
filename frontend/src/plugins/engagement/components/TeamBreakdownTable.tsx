import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { HeartHandshake, Users2 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface TeamBreakdownTableProps {
  rows: EngagementTeamBreakdownRow[];
}

const pendingOver48h = (row: EngagementTeamBreakdownRow): number =>
  (row.metrics.leave?.pending_over_48h ?? 0) +
  (row.metrics.overtime?.pending_over_48h ?? 0) +
  (row.metrics.standby?.pending_over_48h ?? 0);

const score = (value: number | null, suffix = ""): string =>
  value !== null ? `${value.toFixed(0)}${suffix}` : "—";

const StatusCell: React.FC<{ row: EngagementTeamBreakdownRow }> = ({ row }) => (
  <div className="flex items-center gap-1.5">
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
    {row.decisions_during_leave > 0 && (
      <span
        role="status"
        aria-label={`Approved ${row.decisions_during_leave} request(s) while on leave`}
        title={`Approved ${row.decisions_during_leave} request(s) while on leave`}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${toneSurfaceClass.success}`}
      >
        <HeartHandshake className="h-3 w-3" aria-hidden="true" />
        {row.decisions_during_leave}
      </span>
    )}
  </div>
);

export const TeamBreakdownTable: React.FC<TeamBreakdownTableProps> = ({ rows }) => {
  const columns = useMemo<AppColumnDef<EngagementTeamBreakdownRow>[]>(
    () => [
      {
        id: "team",
        accessorKey: "team_name",
        header: "Team",
        cell: ({ row }) => <span className="font-medium">{row.original.team_name}</span>,
      },
      {
        id: "leader",
        accessorKey: "leader_name",
        header: "Leader",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.leader_name}</span>
        ),
      },
      {
        id: "size",
        accessorKey: "team_size",
        header: "Size",
        cell: ({ row }) => <span className="tabular-nums">{row.original.team_size}</span>,
      },
      {
        id: "score",
        accessorKey: "engagement_score",
        header: "Score",
        cell: ({ row }) => (
          <span className="tabular-nums">{score(row.original.engagement_score)}</span>
        ),
      },
      {
        id: "approval",
        accessorKey: "approval_rate_pct",
        header: "Approval Rate",
        cell: ({ row }) => (
          <span className="tabular-nums">{score(row.original.approval_rate_pct, "%")}</span>
        ),
      },
      {
        id: "pending",
        header: "Pending >48h",
        cell: ({ row }) => <span className="tabular-nums">{pendingOver48h(row.original)}</span>,
      },
      {
        id: "resubmissions",
        accessorKey: "resubmission_count",
        header: "Resubmissions",
        cell: ({ row }) => <span className="tabular-nums">{row.original.resubmission_count}</span>,
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusCell row={row.original} />,
      },
    ],
    []
  );

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
      <div className="border-border/60 flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold tracking-tight">Engagement by team</h3>
        <p className="text-muted-foreground text-xs">{rows.length} team(s)</p>
      </div>
      <div className="p-4">
        <DataTable columns={columns} data={rows} />
      </div>
    </GlassCard>
  );
};
