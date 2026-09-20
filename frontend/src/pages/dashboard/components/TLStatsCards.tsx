import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Clock, Shield, Plane, CheckCircle, AlertCircle } from "lucide-react";

interface TLStatsCardsProps {
  pendingTotal: number;
  pendingOvertime: number;
  pendingStandby: number;
  pendingLeave: number;
  approvedCount: number;
  teamSize?: number;
  activeOperatorCount?: number | null;
}

export const TLStatsCards: React.FC<TLStatsCardsProps> = ({
  pendingTotal,
  pendingOvertime,
  pendingStandby,
  pendingLeave,
  approvedCount,
  teamSize = 0,
  activeOperatorCount = null,
}) => {
  const otPercent = pendingTotal > 0 ? (pendingOvertime / pendingTotal) * 100 : 0;
  const sbPercent = pendingTotal > 0 ? (pendingStandby / pendingTotal) * 100 : 0;
  const vacPercent = pendingTotal > 0 ? (pendingLeave / pendingTotal) * 100 : 0;
  const approvedPercent =
    approvedCount + pendingTotal > 0 ? (approvedCount / (approvedCount + pendingTotal)) * 100 : 0;
  const teamClause =
    teamSize > 0
      ? activeOperatorCount != null
        ? `${activeOperatorCount} of ${teamSize} active`
        : `${teamSize} in team`
      : null;

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Pending Approvals"
        value={pendingTotal}
        icon={AlertCircle}
        glow="destructive"
        iconColorClass="text-accent-red"
        iconWellClass="bg-accent-red/10"
        progressPercent={pendingTotal > 0 ? 100 : 0}
        progressColorClass="bg-tone-danger-text"
        footer={
          <>
            <span
              className={
                pendingTotal > 0 ? "font-semibold text-accent-red" : "font-semibold text-success"
              }
            >
              {pendingTotal > 0 ? "Requires your action" : "Queue clear"}
            </span>
            {teamClause && <span className="text-muted-foreground">{teamClause}</span>}
          </>
        }
      />
      <StatCard
        label="Pending Standby"
        value={pendingStandby}
        icon={Shield}
        glow="warning"
        iconColorClass="text-accent-yellow"
        progressPercent={sbPercent}
        progressColorClass="bg-tone-warning-text"
        iconWellClass="bg-accent-yellow/10"
        footer={
          <>
            <span className="font-medium text-muted-foreground">
              {Math.round(sbPercent)}% queue mix
            </span>
            <span className="text-muted-foreground">On-call shifts</span>
          </>
        }
      />
      <StatCard
        label="Pending Leave"
        value={pendingLeave}
        icon={Plane}
        glow="primary"
        iconColorClass="text-accent-violet"
        progressPercent={vacPercent}
        progressColorClass="bg-tone-accent-text"
        iconWellClass="bg-accent-violet/10"
        footer={
          <>
            <span className="font-medium text-muted-foreground">
              {Math.round(vacPercent)}% queue mix
            </span>
            <span className="text-muted-foreground">Planned absence</span>
          </>
        }
      />
      <StatCard
        label="Pending Overtime"
        value={pendingOvertime}
        icon={Clock}
        glow="warning"
        iconColorClass="text-accent-orange"
        iconWellClass="bg-accent-orange/10"
        progressPercent={otPercent}
        progressColorClass="bg-tone-warning-text"
        footer={
          <>
            <span className="font-medium text-muted-foreground">
              {Math.round(otPercent)}% queue mix
            </span>
            <span className="text-muted-foreground">Extra capacity</span>
          </>
        }
      />
      <StatCard
        label="Approved MTD"
        value={approvedCount}
        icon={CheckCircle}
        glow="success"
        iconColorClass="text-success"
        progressPercent={approvedPercent}
        progressColorClass="bg-tone-success-text"
        iconWellClass="bg-accent-emerald/10"
        footer={
          approvedCount + pendingTotal > 0 ? (
            <>
              <span className="font-semibold text-success">
                {Math.round(approvedPercent)}% of all requests
              </span>
              <span className="text-muted-foreground">Recently approved</span>
            </>
          ) : (
            <span className="text-muted-foreground">Recently approved</span>
          )
        }
      />
    </div>
  );
};
