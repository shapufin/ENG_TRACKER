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
}

export const HRInsightsCard: React.FC<HRInsightsCardProps> = ({ insightsData }) => (
  <div className="grid gap-4 md:grid-cols-3">
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
  </div>
);
