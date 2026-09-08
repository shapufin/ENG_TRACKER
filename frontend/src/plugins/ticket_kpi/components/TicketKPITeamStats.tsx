import React from "react";
import { KPICard } from "./KPICard";
import { FileSpreadsheet, Users, Ticket } from "lucide-react";

interface TicketKPITeamStatsProps {
  totalRecords: number;
  uniqueUsers: number;
  uniqueMonths: number;
}

export const TicketKPITeamStats: React.FC<TicketKPITeamStatsProps> = ({
  totalRecords,
  uniqueUsers,
  uniqueMonths,
}) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <KPICard
      title="Total Records"
      value={totalRecords}
      subtitle="In selected period"
      icon={FileSpreadsheet}
      progressPercent={totalRecords > 0 ? 100 : 0}
      progressColorClass="bg-indigo-500"
    />
    <KPICard
      title="Team Members"
      value={uniqueUsers}
      subtitle="With uploads"
      icon={Users}
      progressPercent={uniqueUsers > 0 ? 100 : 0}
      progressColorClass="bg-purple-500"
    />
    <KPICard
      title="Active Months"
      value={uniqueMonths}
      subtitle="With data"
      icon={Ticket}
      progressPercent={uniqueMonths > 0 ? 100 : 0}
      progressColorClass="bg-emerald-500"
    />
  </div>
);
