import React, { useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { ArrowRightLeft, CalendarDays, HeartHandshake, Users2 } from "lucide-react";
import type { EngagementTeamBreakdownRow } from "../types/engagement";

interface TeamBreakdownTableProps {
  rows: EngagementTeamBreakdownRow[];
}

const formatChangeDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return "";
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const sumMetric = (
  row: EngagementTeamBreakdownRow,
  key: "pending_past_deadline" | "breaches"
): number =>
  (row.metrics.leave?.[key] ?? 0) +
  (row.metrics.overtime?.[key] ?? 0) +
  (row.metrics.standby?.[key] ?? 0);

const score = (value: number | null, suffix = ""): string =>
  value !== null ? `${value.toFixed(0)}${suffix}` : "—";

const StatusCell: React.FC<{ row: EngagementTeamBreakdownRow }> = ({ row }) => (
  <div className="flex items-center gap-1.5">
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
    {row.decisions_on_holidays > 0 && (
      <span
        role="status"
        aria-label={`Decided ${row.decisions_on_holidays} request(s) on public holidays`}
        title={`Decided ${row.decisions_on_holidays} request(s) on public holidays (evidence, not scored)`}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${toneSurfaceClass.success}`}
      >
        <CalendarDays className="h-3 w-3" aria-hidden="true" />
        {row.decisions_on_holidays}
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
        cell: ({ row }) => {
          const changedDate = formatChangeDate(row.original.manager_changed_at);
          const changedLabel = changedDate ? `Changed manager · ${changedDate}` : "Changed manager";
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{row.original.team_name}</span>
              {row.original.manager_changed && (
                <span
                  role="status"
                  aria-label={
                    changedDate
                      ? `Team changed manager on ${changedDate}; frozen historical snapshot`
                      : "Team changed manager; frozen historical snapshot"
                  }
                  title={
                    changedDate
                      ? `Team changed manager on ${changedDate}; frozen historical snapshot`
                      : "Team changed manager; frozen historical snapshot"
                  }
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${toneSurfaceClass.warning}`}
                >
                  <ArrowRightLeft className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {changedLabel}
                </span>
              )}
            </div>
          );
        },
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
          <span className="tabular-nums">
            {score(row.original.engagement_score)}
            {(row.original.late_closure_penalty ?? 0) > 0 &&
              row.original.engagement_score !== null && (
                <span
                  className="text-tone-danger-text ml-1 text-xs"
                  title="The month was closed by the system after the cutoff instead of by the leader. These points are already deducted from the score."
                >
                  (-{row.original.late_closure_penalty} late close)
                </span>
              )}
          </span>
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
        id: "breaches",
        header: "Breaches",
        cell: ({ row }) => (
          <span className="tabular-nums">{sumMetric(row.original, "breaches")}</span>
        ),
      },
      {
        id: "pending",
        header: "Pending past deadline",
        cell: ({ row }) => (
          <span className="tabular-nums">{sumMetric(row.original, "pending_past_deadline")}</span>
        ),
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
        <DataTable
          columns={columns}
          data={rows}
          mobileCard={{
            title: "team",
            hero: "score",
            status: "status",
            meta: ["leader", "size", "approval", "breaches", "pending", "resubmissions"],
          }}
        />
      </div>
    </GlassCard>
  );
};
