import React from "react";
import { Clock, Users, Calendar, type LucideIcon } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import type { Tone } from "@/components/ui/tone";

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
    icon: LucideIcon,
    label: string,
    iconTone: Tone
  ) => {
    const hasPendingMonths = (pendingMonths?.[type]?.length ?? 0) > 0;
    const isClickable = !!onCardClick && hasPendingMonths && !loading;
    return (
      <StatCard
        label={label}
        value={loading ? "..." : String(count)}
        icon={icon}
        iconTone={iconTone}
        trend={
          <>
            Pending
            {hasPendingMonths && <span className="max-sm:hidden"> · click to jump</span>}
          </>
        }
        onClick={isClickable ? () => onCardClick!(type) : undefined}
      />
    );
  };

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {renderCard("overtime", overtimeCount, isLoading.overtime, Clock, "Overtime", "info")}
      {renderCard("standby", standbyCount, isLoading.standby, Users, "Standby", "accent")}
      {renderCard("leave", leaveCount, isLoading.leave, Calendar, "Leave", "success")}
    </div>
  );
};
