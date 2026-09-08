import React from "react";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import type { LeaveRequest, User } from "@/types";
import { PersonalDashboardStats } from "./components/PersonalDashboardStats";
import { PersonalDashboardLeavesCard } from "./components/PersonalDashboardLeavesCard";
import { PersonalDashboardProgressCard } from "./components/PersonalDashboardProgressCard";
import { PersonalDashboardPendingCard } from "./components/PersonalDashboardPendingCard";

interface PersonalDashboardViewProps {
  user: User | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overtimeData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  standbyData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveData: any;
  personalOvertimeHours: number;
  personalStandbyHours: number;
  approvedLeaveDays: number;
  pendingLeaveDays: number;
  overtimeProgress: number;
  leaveProgress: number;
  upcomingLeaves: LeaveRequest[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalPendingItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalTimelineItems: any[];
}

export const PersonalDashboardView: React.FC<PersonalDashboardViewProps> = ({
  user,
  personalOvertimeHours,
  personalStandbyHours,
  approvedLeaveDays,
  pendingLeaveDays,
  overtimeProgress,
  leaveProgress,
  upcomingLeaves,
  personalPendingItems,
  personalTimelineItems,
}) => (
  <div className="flex flex-col gap-8">
    <PersonalDashboardStats
      user={user}
      personalOvertimeHours={personalOvertimeHours}
      personalStandbyHours={personalStandbyHours}
      approvedLeaveDays={approvedLeaveDays}
    />

    <div className="grid gap-6 lg:grid-cols-2">
      <PersonalDashboardLeavesCard upcomingLeaves={upcomingLeaves} />
      <PersonalDashboardProgressCard
        overtimeProgress={overtimeProgress}
        leaveProgress={leaveProgress}
        personalStandbyHours={personalStandbyHours}
        pendingLeaveDays={pendingLeaveDays}
      />
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <PersonalDashboardPendingCard personalPendingItems={personalPendingItems} />
      <ActivityTimeline items={personalTimelineItems} delay={0.18} />
    </div>
  </div>
);
