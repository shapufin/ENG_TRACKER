import React from "react";
import { CalendarDays, Plane } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeaveRequest } from "@/types";

interface PersonalDashboardLeavesCardProps {
  upcomingLeaves: LeaveRequest[];
}

export const PersonalDashboardLeavesCard: React.FC<PersonalDashboardLeavesCardProps> = ({
  upcomingLeaves,
}) => (
  <GlassCard>
    <div className="p-6">
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">Scheduled Time Off</p>
        <h3 className="text-lg font-semibold">Recent 3</h3>
      </div>
      <div className="space-y-3">
        {upcomingLeaves.length === 0 && (
          <EmptyState icon={CalendarDays} title="No leave requests" className="p-6" />
        )}
        {upcomingLeaves.map((leave) => (
          <div
            key={leave.id}
            className="flex items-center justify-between rounded-xl border border-border bg-muted/[0.02] p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Plane className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Vacation</p>
                <p className="text-xs text-muted-foreground">
                  {leave.start_date} → {leave.end_date}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold tabular-nums">{leave.days_requested}d</p>
          </div>
        ))}
      </div>
    </div>
  </GlassCard>
);
