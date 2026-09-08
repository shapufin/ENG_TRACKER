import React from "react";
import { Clock, Users, Calendar } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

export type PendingStatType = "overtime" | "standby" | "leave";

interface TLApprovalStatsProps {
  overtimeCount: number;
  standbyCount: number;
  leaveCount: number;
  isLoading: {
    overtime: boolean;
    standby: boolean;
    leave: boolean;
  };
  /** Months with pending items per type (from usePendingMonths). */
  pendingMonths?: {
    overtime: { month: string; count: number }[];
    standby: { month: string; count: number }[];
    leave: { month: string; count: number }[];
  };
  /** Called when a card is clicked. Receives the stat type. */
  onCardClick?: (type: PendingStatType) => void;
}

export const TLApprovalStats: React.FC<TLApprovalStatsProps> = ({
  overtimeCount,
  standbyCount,
  leaveCount,
  isLoading,
  pendingMonths,
  onCardClick,
}) => {
  const renderCard = (
    type: PendingStatType,
    count: number,
    loading: boolean,
    icon: React.ReactNode,
    label: string,
    iconClass: string
  ) => {
    const hasPendingMonths = (pendingMonths?.[type]?.length ?? 0) > 0;
    const isClickable = !!onCardClick && hasPendingMonths && !loading;
    return (
      <GlassCard
        delay={0}
        className={cn(
          "flex items-center gap-4 p-4",
          isClickable && "cursor-pointer hover:border-primary/50"
        )}
        onClick={isClickable ? () => onCardClick!(type) : undefined}
        role={isClickable ? "button" : undefined}
        tabIndex={isClickable ? 0 : undefined}
        aria-disabled={!isClickable}
      >
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-bold">{loading ? "..." : count}</p>
          <p className="text-xs text-muted-foreground">
            {hasPendingMonths ? "Pending · click to jump" : "Pending"}
          </p>
        </div>
      </GlassCard>
    );
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {renderCard(
        "overtime",
        overtimeCount,
        isLoading.overtime,
        <Clock className="h-5 w-5" />,
        "Overtime",
        "bg-primary/10 text-primary"
      )}
      {renderCard(
        "standby",
        standbyCount,
        isLoading.standby,
        <Users className="h-5 w-5" />,
        "Standby",
        "bg-icon-standby/10 text-icon-standby"
      )}
      {renderCard(
        "leave",
        leaveCount,
        isLoading.leave,
        <Calendar className="h-5 w-5" />,
        "Leave",
        "bg-icon-leave/10 text-icon-leave"
      )}
    </div>
  );
};
