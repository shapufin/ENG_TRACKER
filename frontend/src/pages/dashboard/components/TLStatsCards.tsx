import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Clock, Shield, Plane, CheckCircle, AlertCircle } from "lucide-react";

interface TLStatsCardsProps {
  pendingTotal: number;
  pendingOvertime: number;
  pendingStandby: number;
  pendingLeave: number;
  approvedCount: number;
}

export const TLStatsCards: React.FC<TLStatsCardsProps> = ({
  pendingTotal,
  pendingOvertime,
  pendingStandby,
  pendingLeave,
  approvedCount,
}) => {
  const otPercent = pendingTotal > 0 ? (pendingOvertime / pendingTotal) * 100 : 0;
  const sbPercent = pendingTotal > 0 ? (pendingStandby / pendingTotal) * 100 : 0;
  const vacPercent = pendingTotal > 0 ? (pendingLeave / pendingTotal) * 100 : 0;
  const approvedPercent =
    approvedCount + pendingTotal > 0 ? (approvedCount / (approvedCount + pendingTotal)) * 100 : 0;

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Pending Approvals"
        value={pendingTotal}
        icon={AlertCircle}
        glow="destructive"
        iconColorClass="text-accent-red"
        iconWellClass="bg-accent-red/10"
        trend="Requires your action"
        progressPercent={pendingTotal > 0 ? 100 : 0}
        progressColorClass="bg-tone-danger-text"
      />
      <StatCard
        label="Pending OT"
        value={pendingOvertime}
        icon={Clock}
        glow="warning"
        iconColorClass="text-accent-orange"
        iconWellClass="bg-accent-orange/10"
        trend="Overtime requests"
        progressPercent={otPercent}
        progressColorClass="bg-tone-warning-text"
      />
      <StatCard
        label="Pending SB"
        value={pendingStandby}
        icon={Shield}
        glow="warning"
        iconColorClass="text-accent-yellow"
        trend="Standby requests"
        progressPercent={sbPercent}
        progressColorClass="bg-tone-warning-text"
        iconWellClass="bg-accent-yellow/10"
      />
      <StatCard
        label="Pending VAC"
        value={pendingLeave}
        icon={Plane}
        glow="primary"
        iconColorClass="text-accent-violet"
        trend="Vacation requests"
        progressPercent={vacPercent}
        progressColorClass="bg-tone-accent-text"
        iconWellClass="bg-accent-violet/10"
      />
      <StatCard
        label="Approved"
        value={approvedCount}
        icon={CheckCircle}
        glow="success"
        iconColorClass="text-success"
        trend="Recently approved"
        progressPercent={approvedPercent}
        progressColorClass="bg-tone-success-text"
        iconWellClass="bg-accent-emerald/10"
      />
    </div>
  );
};
