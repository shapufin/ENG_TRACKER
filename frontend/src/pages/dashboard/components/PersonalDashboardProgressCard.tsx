import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressRing } from "@/components/dashboard/ProgressRing";

interface PersonalDashboardProgressCardProps {
  personalOvertimeHours: number;
  leaveProgress: number;
  personalStandbyHours: number;
  pendingLeaveDays: number;
}

export const PersonalDashboardProgressCard: React.FC<PersonalDashboardProgressCardProps> = ({
  personalOvertimeHours,
  leaveProgress,
  personalStandbyHours,
  pendingLeaveDays,
}) => (
  <GlassCard isHoverLift={false} className="p-6">
    <div className="mb-4">
      <p className="text-sm text-muted-foreground">My Progress</p>
      <h3 className="text-lg font-semibold">Leave goal & hours</h3>
    </div>
    <div className="space-y-4">
      {/* Overtime has no target to work toward — it's logged as needed, not
          budgeted against a quota — so it gets a plain hours tile below,
          not a goal ring. Leave has a real annual entitlement, so it keeps one. */}
      <ProgressRing value={leaveProgress} label="Leave Used" colorClass="text-warning" />
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Overtime Hours</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{personalOvertimeHours}h</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Standby Hours</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{personalStandbyHours}h</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs text-muted-foreground">Pending Leave</p>
          <p className="font-mono text-lg font-semibold tabular-nums">{pendingLeaveDays}d</p>
        </div>
      </div>
    </div>
  </GlassCard>
);
