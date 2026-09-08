import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Zap,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import type { AnalyticsInsight } from "./types";
import { cn } from "@/lib/utils";

interface AnalyticsInsightsProps {
  insights: AnalyticsInsight[] | undefined;
  isLoading?: boolean;
}

const SEVERITY_STYLES: Record<
  AnalyticsInsight["severity"],
  { border: string; bg: string; iconBg: string; title: string; desc: string }
> = {
  info: {
    border: "border-primary/20",
    bg: "bg-primary/5",
    iconBg: "bg-primary/10",
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
  warning: {
    border: "border-warning/20",
    bg: "bg-warning/5",
    iconBg: "bg-warning/10",
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
  critical: {
    border: "border-destructive/20",
    bg: "bg-destructive/5",
    iconBg: "bg-destructive/10",
    title: "text-foreground",
    desc: "text-muted-foreground",
  },
};

const TYPE_ICONS: Record<AnalyticsInsight["type"], React.FC<{ className?: string }>> = {
  trend_up: TrendingUp,
  trend_down: TrendingDown,
  concentration: BarChart3,
  backlog: Clock,
  spike: Zap,
  status_bottleneck: AlertTriangle,
};

export const AnalyticsInsights: React.FC<AnalyticsInsightsProps> = ({ insights, isLoading }) => {
  if (isLoading) {
    return (
      <GlassCard className="p-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 animate-pulse text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Analyzing patterns...</span>
        </div>
      </GlassCard>
    );
  }

  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Automated Insights</h3>
        <span className="text-xs text-muted-foreground">
          {insights.length} {insights.length === 1 ? "finding" : "findings"}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight) => {
          const styles = SEVERITY_STYLES[insight.severity];
          const Icon = TYPE_ICONS[insight.type] || AlertTriangle;
          return (
            <GlassCard
              key={`${insight.type}-${insight.metric}`}
              className={cn("border p-4", styles.border, styles.bg)}
            >
              <div className="flex items-start gap-3">
                <div className={cn("shrink-0 rounded-lg p-2", styles.iconBg)}>
                  <Icon className={cn("h-4 w-4", styles.title)} />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className={cn("text-sm font-semibold leading-tight", styles.title)}>
                    {insight.title}
                  </h4>
                  <p className={cn("mt-1 text-xs leading-relaxed", styles.desc)}>
                    {insight.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
};
