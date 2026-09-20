import React from "react";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import type { LeaveRequest, OvertimeLog, StandbyLog, User } from "@/types";
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
  vacationBalanceDays: number;
  pendingLeaveDays: number;
  leaveProgress: number;
  upcomingLeaves: LeaveRequest[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalPendingItems: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  personalTimelineItems: any[];
  weekOvertimeLogs?: Pick<OvertimeLog, "date" | "hours">[];
  weekStandbyLogs?: Pick<StandbyLog, "date" | "hours">[];
  /** ISO end date of the selected rolling week window (chart buckets from it). */
  weekReferenceDate?: string;
  leaveUsedDays?: number;
  leaveAvailableDays?: number;
  /** 0 = this week, 1 = last week. Selector hidden when handler is absent. */
  weekOffset?: 0 | 1;
  onWeekOffsetChange?: (offset: 0 | 1) => void;
}

export const PersonalDashboardView: React.FC<PersonalDashboardViewProps> = ({
  user,
  personalOvertimeHours,
  personalStandbyHours,
  vacationBalanceDays,
  pendingLeaveDays,
  leaveProgress,
  upcomingLeaves,
  personalPendingItems,
  personalTimelineItems,
  weekOvertimeLogs,
  weekStandbyLogs,
  weekReferenceDate,
  leaveUsedDays,
  leaveAvailableDays,
  weekOffset,
  onWeekOffsetChange,
}) => (
  <div className="flex flex-col gap-8">
    <PersonalDashboardStats
      user={user}
      personalOvertimeHours={personalOvertimeHours}
      personalStandbyHours={personalStandbyHours}
      vacationBalanceDays={vacationBalanceDays}
    />

    {/* Hero widget first at full width: the gauge + 3-tile row needs the
        room — at half width the tiles crush to ~100px and labels collide
        with their icon wells. */}
    <PersonalDashboardProgressCard
      personalOvertimeHours={personalOvertimeHours}
      leaveProgress={leaveProgress}
      personalStandbyHours={personalStandbyHours}
      pendingLeaveDays={pendingLeaveDays}
      weekOvertimeLogs={weekOvertimeLogs}
      weekStandbyLogs={weekStandbyLogs}
      weekReferenceDate={weekReferenceDate}
      leaveUsedDays={leaveUsedDays}
      leaveAvailableDays={leaveAvailableDays}
      weekOffset={weekOffset}
      onWeekOffsetChange={onWeekOffsetChange}
    />

    <div className="grid gap-6 lg:grid-cols-2">
      <PersonalDashboardLeavesCard upcomingLeaves={upcomingLeaves} />
      <PersonalDashboardPendingCard personalPendingItems={personalPendingItems} />
    </div>

    <ActivityTimeline items={personalTimelineItems} delay={0.18} />
  </div>
);
