import React from "react";
import { HRDashboardStats } from "./components/HRDashboardStats";
import { HRDashboardCharts } from "./components/HRDashboardCharts";
import { HRRecentTable } from "./components/HRRecentTable";
import { HRDashboardPendingLeave } from "./components/HRDashboardPendingLeave";
import { HRQuickLinks } from "./components/HRQuickLinks";
import { ErrorCard } from "@/components/ui/ErrorCard";
import type { HROverview } from "@/types";

interface HoursTableRow {
  id: number;
  user: string;
  userInitials: string;
  duration: string;
  date: string;
  status: string;
}

interface HRDashboardViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrStats: any;
  monthlyData: { day: string; month?: string; overtime: number; standby?: number }[];
  statusBars: { label: string; value: number }[];
  recentOvertimeTable: HoursTableRow[];
  recentStandbyTable: HoursTableRow[];
  pendingLeaveItems: HROverview["pending_leave"];
  pendingLeaveTotal: number;
  /** The hr_overview request failed — every section shows one retry card. */
  isError?: boolean;
  onRetry?: () => void;
}

export const HRDashboardView: React.FC<HRDashboardViewProps> = ({
  hrStats,
  monthlyData,
  statusBars,
  recentOvertimeTable,
  recentStandbyTable,
  pendingLeaveItems,
  pendingLeaveTotal,
  isError,
  onRetry,
}) => {
  if (isError) {
    return (
      <ErrorCard
        title="Couldn't load the HR dashboard"
        message="The overview request failed."
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <HRDashboardStats hrStats={hrStats} />
      <HRDashboardCharts monthlyData={monthlyData} statusBars={statusBars} />

      <div className="grid gap-6 lg:grid-cols-2">
        <HRRecentTable title="Recent Overtime" data={recentOvertimeTable} />
        <HRRecentTable title="Recent Standby" data={recentStandbyTable} />
      </div>

      <HRQuickLinks />

      <HRDashboardPendingLeave items={pendingLeaveItems} total={pendingLeaveTotal} />
    </div>
  );
};
