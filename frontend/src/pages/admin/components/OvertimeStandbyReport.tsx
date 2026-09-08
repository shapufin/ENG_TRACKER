import React from "react";
import { OvertimeAggregateCard } from "./OvertimeAggregateCard";
import { StandbyAggregateCard } from "./StandbyAggregateCard";
import { OvertimeStandbyTrendChart } from "./OvertimeStandbyTrendChart";

interface OvertimeStandbyReportProps {
  summaryData?: {
    overtime?: {
      total_hours: number;
      approved_hours: number;
      total_entries: number;
      pending_count: number;
    };
    standby?: {
      total_hours: number;
      approved_hours: number;
      total_entries: number;
      pending_count: number;
    };
  };
  detailedData?: {
    overtime?: { month?: string; year?: string; total_hours: number }[];
    standby?: { total_hours: number }[];
  };
  groupBy: string;
}

export const OvertimeStandbyReport: React.FC<OvertimeStandbyReportProps> = ({
  summaryData,
  detailedData,
  groupBy,
}) => (
  <div className="space-y-6">
    <div className="grid gap-6 md:grid-cols-2">
      {summaryData?.overtime && (
        <OvertimeAggregateCard
          total_hours={summaryData.overtime.total_hours}
          approved_hours={summaryData.overtime.approved_hours}
          total_entries={summaryData.overtime.total_entries}
          pending_count={summaryData.overtime.pending_count}
        />
      )}
      {summaryData?.standby && (
        <StandbyAggregateCard
          total_hours={summaryData.standby.total_hours}
          approved_hours={summaryData.standby.approved_hours}
          total_entries={summaryData.standby.total_entries}
          pending_count={summaryData.standby.pending_count}
        />
      )}
    </div>

    {detailedData && groupBy !== "user" && (
      <OvertimeStandbyTrendChart
        overtime={detailedData.overtime ?? []}
        standby={detailedData.standby ?? []}
      />
    )}
  </div>
);
