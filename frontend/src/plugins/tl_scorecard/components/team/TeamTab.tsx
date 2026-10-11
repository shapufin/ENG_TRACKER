import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, ShieldAlert, Target, UserMinus, Users } from "lucide-react";
import { UserCell } from "@/components/admin/UserCell";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/RowActions";
import { StatCard } from "@/components/ui/StatCard";
import { toneSurfaceClass } from "@/components/ui/tone";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { toDays } from "@/pages/admin/hooks/leaveBalanceFilters";
import { cn } from "@/lib/utils";
import { tlScorecardService } from "../../services/tlScorecardService";
import type { TeamMemberSummary } from "../../types/tlScorecard";
import { TeamMemberDetailPanel } from "./TeamMemberDetailPanel";
import {
  EPR_STEPS,
  SENIORITY_LABELS,
  eprStageDone,
  formatWage,
  wageUnavailableReason,
} from "./teamMeta";

/** Governance chips for one member; empty when nothing is open. */
const GovernanceBadges: React.FC<{ member: TeamMemberSummary }> = ({ member }) => {
  const { governance } = member;
  const chips: { key: string; label: string; tone: "danger" | "warning" | "accent" }[] = [];
  if (governance.open_pip) chips.push({ key: "pip", label: "PIP", tone: "danger" });
  if (governance.open_idle_flags > 0)
    chips.push({ key: "idle", label: `Idle x ${governance.open_idle_flags}`, tone: "warning" });
  if (governance.open_absences > 0)
    chips.push({ key: "absence", label: `Absence x ${governance.open_absences}`, tone: "warning" });
  if (governance.pending_promotion)
    chips.push({ key: "promotion", label: "Promotion", tone: "accent" });
  if (chips.length === 0) return <span className="text-muted-foreground text-xs">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="outline"
          className={cn("text-xs font-normal", toneSurfaceClass[chip.tone])}
        >
          {chip.label}
        </Badge>
      ))}
    </div>
  );
};

/** Three dots, one per EPR stage; the text is what screen readers announce. */
const EprStepper: React.FC<{ member: TeamMemberSummary }> = ({ member }) => {
  const doneCount = EPR_STEPS.filter((step) => eprStageDone(member.epr, step.stage)).length;
  return (
    <div className="flex items-center gap-1.5" title={`${member.epr.year} EPR`}>
      {EPR_STEPS.map((step) => (
        <span
          key={step.stage}
          aria-hidden="true"
          className={cn(
            "h-2.5 w-2.5 rounded-full border",
            eprStageDone(member.epr, step.stage)
              ? toneSurfaceClass.success
              : toneSurfaceClass.neutral
          )}
        />
      ))}
      <span className="sr-only">{`${doneCount} of ${EPR_STEPS.length} EPR stages done`}</span>
      <span aria-hidden="true" className="text-muted-foreground text-xs tabular-nums">
        {doneCount}/{EPR_STEPS.length}
      </span>
    </div>
  );
};

const buildColumns = (
  onView: (member: TeamMemberSummary) => void
): AppColumnDef<TeamMemberSummary>[] => [
  {
    id: "full_name",
    accessorKey: "full_name",
    header: "Employee",
    cell: ({ row }) => (
      <UserCell
        name={row.original.full_name}
        subtitle={
          row.original.seniority_level
            ? (SENIORITY_LABELS[row.original.seniority_level] ?? row.original.email)
            : row.original.email
        }
      />
    ),
  },
  {
    id: "leave_available",
    header: "Leave available",
    cell: ({ row }) => {
      const days = toDays(row.original.leave.available_days);
      return <span className="tabular-nums">{days === null ? "—" : `${days} d`}</span>;
    },
  },
  {
    id: "epr",
    header: "EPR",
    cell: ({ row }) => <EprStepper member={row.original} />,
  },
  {
    id: "governance",
    header: "Governance",
    cell: ({ row }) => <GovernanceBadges member={row.original} />,
  },
  {
    id: "wage",
    header: "Wage",
    cell: ({ row }) => {
      const text = formatWage(row.original.wage.gross_monthly);
      const reason = wageUnavailableReason(row.original.wage.status);
      if (text) return <span className="font-mono tabular-nums">{text}</span>;
      return (
        <span className="text-muted-foreground font-mono" title={reason ?? undefined}>
          —{reason && <span className="sr-only"> {reason}</span>}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <RowActions
        actions={[
          {
            label: `View details for ${row.original.full_name}`,
            icon: Eye,
            onClick: () => onView(row.original),
          },
        ]}
      />
    ),
  },
];

/**
 * The TL's team: one row per scoreable member, with a read-only detail panel.
 * The roster is one request; opening a member reads the row already loaded.
 */
export const TeamTab: React.FC = () => {
  const [selected, setSelected] = useState<TeamMemberSummary | null>(null);
  const teamQuery = useQuery({
    queryKey: ["tl-scorecard", "team-members", "self"],
    queryFn: async () => (await tlScorecardService.getTeamMembers()).data,
  });
  const columns = useMemo(() => buildColumns(setSelected), []);

  if (teamQuery.isError) {
    return (
      <ErrorCard
        title="Couldn't load your team"
        message="Check your connection and try again."
        onRetry={() => void teamQuery.refetch()}
      />
    );
  }

  if (teamQuery.isLoading || !teamQuery.data) {
    return (
      <div aria-busy="true" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <span className="sr-only">Loading your team…</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted/40 h-24 animate-pulse rounded-lg border" />
        ))}
      </div>
    );
  }

  const members = teamQuery.data;
  if (members.length === 0) {
    return (
      <GlassCard animateOnMount={false} className="p-0">
        <EmptyState
          icon={Users}
          title="No team members yet"
          description="Team members appear here once they are assigned to your team."
          className="py-10"
        />
      </GlassCard>
    );
  }

  const openPips = members.filter((m) => m.governance.open_pip).length;
  const openAbsences = members.reduce((sum, m) => sum + m.governance.open_absences, 0);
  const eprDone = members.filter((m) => m.epr.goal_setting_done).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Members" value={members.length} icon={Users} iconTone="info" />
        <StatCard label="Open PIPs" value={openPips} icon={ShieldAlert} iconTone="danger" />
        <StatCard label="Open absences" value={openAbsences} icon={UserMinus} iconTone="warning" />
        <StatCard
          label="EPR goal setting done"
          value={`${eprDone}/${members.length}`}
          icon={Target}
          iconTone="success"
        />
      </div>

      <GlassCard animateOnMount={false} className="overflow-hidden p-0">
        <DataTable
          columns={columns}
          data={members}
          searchColumn="full_name"
          searchPlaceholder="Search team members"
          getRowId={(row) => String(row.id)}
          onRowClick={setSelected}
          emptyMessage="No team members match your search."
        />
      </GlassCard>

      <TeamMemberDetailPanel
        member={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
};
