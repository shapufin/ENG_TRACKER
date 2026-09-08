import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressRing } from "@/components/dashboard/ProgressRing";

interface PersonalDashboardProgressCardProps {
  overtimeProgress: number;
  leaveProgress: number;
  personalStandbyHours: number;
  pendingLeaveDays: number;
}

export const PersonalDashboardProgressCard: React.FC<PersonalDashboardProgressCardProps> = ({
  overtimeProgress,
  leaveProgress,
  personalStandbyHours,
  pendingLeaveDays,
}) => (
  <GlassCard isHoverLift={false} className="p-6">
    <div className="mb-4">
      <p className="text-sm text-muted-foreground">My Progress</p>
      <h3 className="text-lg font-semibold">Hours & leave goal</h3>
    </div>
    <div className="space-y-4">
      <ProgressRing value={overtimeProgress} label="Overtime" />
      <ProgressRing value={leaveProgress} label="Leave Used" colorClass="text-warning" />
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Standby Hours</p>
          <p className="text-lg font-semibold tabular-nums">{personalStandbyHours}h</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Pending Leave</p>
          <p className="text-lg font-semibold tabular-nums">{pendingLeaveDays}d</p>
        </div>
      </div>
    </div>
  </GlassCard>
);
