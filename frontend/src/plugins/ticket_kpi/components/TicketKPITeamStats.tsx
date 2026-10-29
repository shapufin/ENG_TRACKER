import React from "react";
import { KPICard } from "./KPICard";
import { FileSpreadsheet, Users, Ticket } from "lucide-react";
import { toneFillClass } from "@/components/ui/tone";

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
      progressColorClass={toneFillClass.info}
    />
    <KPICard
      title="Team Members"
      value={uniqueUsers}
      subtitle="With uploads"
      icon={Users}
      progressPercent={uniqueUsers > 0 ? 100 : 0}
      progressColorClass={toneFillClass.accent}
    />
    <KPICard
      title="Active Months"
      value={uniqueMonths}
      subtitle="With data"
      icon={Ticket}
      progressPercent={uniqueMonths > 0 ? 100 : 0}
      progressColorClass={toneFillClass.success}
    />
  </div>
);
