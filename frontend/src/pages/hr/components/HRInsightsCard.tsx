import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { toneTextClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";

interface InsightsData {
  /** Null without a date range: there is no previous period to compare with. */
  overtime_increase: number | null;
  /** Null when no vacation balance is allocated for the year. */
  leave_utilization: number | null;
  standby_hours: number;
}

export type HRKpiSortKey = "overtime" | "standby" | "leave";

interface HRInsightsCardProps {
  insightsData: InsightsData;
  activeSort?: HRKpiSortKey | "name";
  onlyWithPending?: boolean;
  pendingPeopleCount?: number;
  totalPeopleCount?: number;
  pendingHoursTotal?: number;
  onSortClick?: (key: HRKpiSortKey) => void;
  onTogglePending?: () => void;
}

const percent = (value: number | null) => (value === null ? "—" : `${value}%`);

export const HRInsightsCard: React.FC<HRInsightsCardProps> = ({
  insightsData,
  activeSort,
  onlyWithPending = false,
  pendingPeopleCount = 0,
  totalPeopleCount = 0,
  pendingHoursTotal = 0,
  onSortClick,
  onTogglePending,
}) => {
  const otDelta = insightsData.overtime_increase;
  const otPrefix = otDelta !== null && otDelta > 0 ? "+" : "";

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="divide-border/60 grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <button
          type="button"
          aria-pressed={activeSort === "overtime"}
          onClick={() => onSortClick?.("overtime")}
          className={cn(
            "hover:bg-muted/35 focus-visible:ring-focus flex cursor-pointer flex-col justify-between p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
            activeSort === "overtime" && "bg-primary/5"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">Overtime trend</span>
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums",
              otDelta === null ? "text-muted-foreground" : "text-primary"
            )}
          >
            {otDelta === null ? "—" : `${otPrefix}${otDelta}%`}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {otDelta === null ? "No previous period to compare" : "vs previous period"}
          </p>
        </button>

        <button
          type="button"
          aria-pressed={activeSort === "leave"}
          onClick={() => onSortClick?.("leave")}
          className={cn(
            "hover:bg-muted/35 focus-visible:ring-focus flex cursor-pointer flex-col justify-between p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
            activeSort === "leave" && "bg-primary/5"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">Leave utilization</span>
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums",
              insightsData.leave_utilization === null
                ? "text-muted-foreground"
                : toneTextClass.success
            )}
          >
            {percent(insightsData.leave_utilization)}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Year to date</p>
        </button>

        <button
          type="button"
          aria-pressed={activeSort === "standby"}
          onClick={() => onSortClick?.("standby")}
          className={cn(
            "hover:bg-muted/35 focus-visible:ring-focus flex cursor-pointer flex-col justify-between p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
            activeSort === "standby" && "bg-primary/5"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">Standby hours</span>
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums",
              toneTextClass.warning
            )}
          >
            {insightsData.standby_hours}h
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Approved</p>
        </button>

        <button
          type="button"
          aria-pressed={onlyWithPending}
          onClick={() => onTogglePending?.()}
          className={cn(
            "hover:bg-muted/35 focus-visible:ring-focus flex cursor-pointer flex-col justify-between p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
            onlyWithPending && "bg-primary/5"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">Pending review</span>
            {pendingHoursTotal > 0 && (
              <span
                className={`font-mono text-xs font-medium tabular-nums ${toneTextClass.warning}`}
              >
                +{pendingHoursTotal}h pending
              </span>
            )}
          </div>
          <div className="text-foreground mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {pendingPeopleCount}
            <span className="text-muted-foreground text-sm font-normal">
              {" "}
              / {totalPeopleCount} people
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {pendingPeopleCount > 0 ? "Click to filter pending items" : "All items reviewed"}
          </p>
        </button>
      </div>
    </GlassCard>
  );
};
