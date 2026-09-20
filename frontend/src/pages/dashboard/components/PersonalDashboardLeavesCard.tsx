import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Plane } from "lucide-react";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { LeaveRequest } from "@/types";

interface PersonalDashboardLeavesCardProps {
  upcomingLeaves: LeaveRequest[];
}

export const PersonalDashboardLeavesCard: React.FC<PersonalDashboardLeavesCardProps> = ({
  upcomingLeaves,
}) => (
  <DashboardSectionShell
    title="Recent 3"
    subtitle="Scheduled Time Off"
    controls={
      <Link to="/calendar" className="text-xs font-semibold text-primary hover:underline">
        View Calendar
      </Link>
    }
    bodyClassName="flex flex-col gap-3"
  >
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
    <Button variant="outline" className="w-full" asChild>
      <Link to="/leave-management">
        Request Time Off <ArrowUpRight className="h-4 w-4" />
      </Link>
    </Button>
  </DashboardSectionShell>
);
