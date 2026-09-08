import React from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";

interface TeamOverviewCardProps {
  memberCount: number;
  teamCount: number;
  vacationDaysLeft: number;
  overtimeHours: number;
  standbyHours: number;
}

export const TeamOverviewCard: React.FC<TeamOverviewCardProps> = ({
  memberCount,
  teamCount,
  vacationDaysLeft,
  overtimeHours,
  standbyHours,
}) => {
  return (
    <GlassCard className="border-l-4 border-l-primary p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Team Overview</h2>
          <p className="text-sm text-muted-foreground">
            Manage your team&apos;s overtime, standby, and leave requests
          </p>
        </div>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Badge variant="secondary" className="px-4 py-2 text-lg">
            {memberCount}
          </Badge>
        </motion.div>
      </div>
      {memberCount > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Teams</p>
            <p className="text-2xl font-semibold tabular-nums">{teamCount > 0 ? teamCount : "–"}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Vacation Left</p>
            <p className="text-2xl font-semibold tabular-nums text-success">
              {vacationDaysLeft.toFixed(1)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overtime (Mo)</p>
            <p className="text-2xl font-semibold tabular-nums text-warning">
              {overtimeHours.toFixed(2)}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Standby (Mo)</p>
            <p className="text-2xl font-semibold tabular-nums text-destructive">
              {standbyHours.toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
