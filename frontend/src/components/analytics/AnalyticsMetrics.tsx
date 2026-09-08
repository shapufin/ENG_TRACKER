import React from "react";
import { StatCard, type StatCardProps } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Users, Clock, TrendingUp, Briefcase, CalendarDays } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AnalyticsMetric } from "./types";

interface AnalyticsMetricsProps {
  metrics: AnalyticsMetric[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

interface MetricConfig {
  icon: LucideIcon;
  glow: NonNullable<StatCardProps["glow"]>;
  iconColorClass?: string;
  suffix?: string;
}

const getMetricConfig = (name: string): MetricConfig => {
  if (name.includes("Users")) return { icon: Users, glow: "primary" };
  if (name.includes("Active"))
    return { icon: Users, glow: "success", iconColorClass: "text-success" };
  if (name.includes("Leave"))
    return { icon: CalendarDays, glow: "warning", iconColorClass: "text-warning" };
  if (name.includes("Standby"))
    return { icon: Clock, glow: "warning", iconColorClass: "text-warning" };
  if (name.includes("Hours") || name.includes("MTTA")) return { icon: Clock, glow: "primary" };
  if (name.includes("Utilization"))
    return { icon: TrendingUp, glow: "success", iconColorClass: "text-success" };
  return { icon: Briefcase, glow: "primary" };
};

const formatTrend = (metric: AnalyticsMetric): string => {
  const change = metric.change;
  const direction = metric.trend === "up" ? "+" : metric.trend === "down" ? "-" : "";
  return `${direction}${Math.abs(change)}% vs prev`;
};

export const AnalyticsMetrics: React.FC<AnalyticsMetricsProps> = ({
  metrics,
  isLoading,
  error,
}) => {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border/70 bg-card" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Failed to load analytics data</p>
          <p className="mt-1 text-xs text-muted-foreground">Please try again later</p>
        </div>
      </div>
    );
  }

  if (!metrics || metrics.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => {
        const config = getMetricConfig(metric.name);
        return (
          <StatCard
            key={metric.name}
            label={metric.name}
            value={<AnimatedNumber value={metric.value} suffix={config.suffix ?? metric.unit} />}
            icon={config.icon}
            glow={config.glow}
            iconColorClass={config.iconColorClass}
            trend={formatTrend(metric)}
            delay={index * 0.05}
          />
        );
      })}
    </div>
  );
};
