import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { TrendingUp, CalendarDays, ShieldCheck } from "lucide-react";

interface InsightsData {
  /** Null without a date range: there is no previous period to compare with. */
  overtime_increase: number | null;
  /** Null when no vacation balance is allocated for the year. */
  leave_utilization: number | null;
  standby_hours: number;
}

interface HRInsightsCardProps {
  insightsData: InsightsData;
  /** Export action mini-card, rendered as the 4th grid slot (mockup: export
   * buttons merge into the insight-cards row instead of a separate bar). */
  actionBar?: React.ReactNode;
}

const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

export const HRInsightsCard: React.FC<HRInsightsCardProps> = ({ insightsData, actionBar }) => (
  <div className="grid items-start gap-4 md:grid-cols-4">
    <StatCard
      label="Overtime Increase"
      value={percent(insightsData.overtime_increase)}
      trend={insightsData.overtime_increase === null ? "No previous period to compare" : "vs previous period"}
      icon={TrendingUp}
      delay={0}
      glow="primary"
      iconColorClass="text-primary/50"
      valueColorClass="text-primary"
    />
    <StatCard
      label="Leave Utilization"
      value={percent(insightsData.leave_utilization)}
      trend="Year to date"
      icon={CalendarDays}
      delay={0.05}
      glow="success"
      iconColorClass="text-success"
      valueColorClass="text-success"
    />
    <StatCard
      label="Standby Hours"
      value={`${insightsData.standby_hours}h`}
      trend="Approved"
      icon={ShieldCheck}
      delay={0.1}
      glow="warning"
      iconColorClass="text-warning"
      valueColorClass="text-warning"
    />
    {actionBar}
  </div>
);
