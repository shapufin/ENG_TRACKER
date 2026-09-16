import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { TrendingUp, CalendarDays, ShieldCheck } from "lucide-react";

interface InsightsData {
  overtime_increase: number;
  leave_utilization: number;
  standby_coverage: number;
}

interface HRInsightsCardProps {
  insightsData: InsightsData;
  /** Export action mini-card, rendered as the 4th grid slot (mockup: export
   * buttons merge into the insight-cards row instead of a separate bar). */
  actionBar?: React.ReactNode;
}

export const HRInsightsCard: React.FC<HRInsightsCardProps> = ({ insightsData, actionBar }) => (
  <div className="grid gap-4 md:grid-cols-4">
    <StatCard
      label="Overtime Increase"
      value={`${insightsData.overtime_increase}%`}
      icon={TrendingUp}
      delay={0}
      glow="primary"
      iconColorClass="text-primary/50"
      valueColorClass="text-primary"
    />
    <StatCard
      label="Leave Utilization"
      value={`${insightsData.leave_utilization}%`}
      icon={CalendarDays}
      delay={0.05}
      glow="success"
      iconColorClass="text-success"
      valueColorClass="text-success"
    />
    <StatCard
      label="Standby Coverage"
      value={`${insightsData.standby_coverage}%`}
      icon={ShieldCheck}
      delay={0.1}
      glow="warning"
      iconColorClass="text-warning"
      valueColorClass="text-warning"
    />
    {actionBar}
  </div>
);
