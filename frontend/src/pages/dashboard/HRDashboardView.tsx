import React from "react";
import { HRDashboardStats } from "./components/HRDashboardStats";
import { HRDashboardCharts } from "./components/HRDashboardCharts";
import { HRRecentTable } from "./components/HRRecentTable";
import { HRDashboardPendingLeave } from "./components/HRDashboardPendingLeave";

interface HRDashboardViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hrStats: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overtimeData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  standbyData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  leaveData: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monthlyData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  statusBars: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentOvertimeTable: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentStandbyTable: any[];
}

export const HRDashboardView: React.FC<HRDashboardViewProps> = ({
  hrStats,
  monthlyData,
  statusBars,
  recentOvertimeTable,
  recentStandbyTable,
  leaveData,
}) => (
  <div className="flex flex-col gap-8">
    <HRDashboardStats hrStats={hrStats} />
    <HRDashboardCharts monthlyData={monthlyData} statusBars={statusBars} />

    <div className="grid gap-6 lg:grid-cols-2">
      <HRRecentTable title="Recent Overtime" data={recentOvertimeTable} />
      <HRRecentTable title="Recent Standby" data={recentStandbyTable} />
    </div>

    <HRDashboardPendingLeave leaveData={leaveData} />
  </div>
);
