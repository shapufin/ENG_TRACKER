import React from "react";
import { StatCard } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Plane, Check, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LeaveBalance } from "@/types";

interface LeaveStatsCardsProps {
  pendingCount: number;
  approvedCount: number;
  balances: LeaveBalance[] | undefined;
  isLoading: boolean;
  /** TL-flavored cards render a mockup-matching progress bar; Employee cards do not. */
  isTeamLeader?: boolean;
}

interface CardConfig {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  glow: "primary" | "success" | "warning" | "destructive" | "none";
  iconColorClass: string;
  delay: number;
  progressPercent?: number;
  progressColorClass?: string;
}

const StatCardContent: React.FC<CardConfig & { isLoading: boolean }> = ({
  icon: Icon,
  label,
  value,
  suffix,
  glow,
  iconColorClass,
  delay,
  isLoading,
  progressPercent,
  progressColorClass,
}) => (
  <StatCard
    label={label}
    value={
      isLoading ? (
        <span className="animate-pulse">...</span>
      ) : (
        <AnimatedNumber value={value} suffix={suffix} />
      )
    }
    icon={Icon}
    glow={glow}
    iconColorClass={iconColorClass}
    delay={delay}
    progressPercent={progressPercent}
    progressColorClass={progressColorClass}
  />
);

export const LeaveStatsCards: React.FC<LeaveStatsCardsProps> = ({
  pendingCount,
  approvedCount,
  balances,
  isLoading,
  isTeamLeader,
}) => {
  const vacationBalance = (balances ?? []).find(
    (b) => b.leave_type === "vacation" && !b.is_carry_over
  );
  const totalUsedDays = (balances ?? [])
    .filter((b) => b.leave_type === "vacation")
    .reduce((sum, b) => sum + (Number(b.used_days) || 0), 0);
  const balanceValue =
    vacationBalance?.effective_available_days ?? vacationBalance?.available_days ?? 0;
  const totalAllowanceDays = vacationBalance?.total_days ?? 0;

  const requestTotal = pendingCount + approvedCount;
  const pendingPercent =
    isTeamLeader && requestTotal > 0 ? (pendingCount / requestTotal) * 100 : undefined;
  const approvedPercent =
    isTeamLeader && requestTotal > 0 ? (approvedCount / requestTotal) * 100 : undefined;
  const balancePercent =
    isTeamLeader && totalAllowanceDays > 0 ? (balanceValue / totalAllowanceDays) * 100 : undefined;
  const usedPercent =
    isTeamLeader && totalAllowanceDays > 0 ? (totalUsedDays / totalAllowanceDays) * 100 : undefined;

  const cards: CardConfig[] = [
    {
      icon: Plane,
      label: "Pending",
      value: pendingCount,
      glow: "warning",
      iconColorClass: "text-icon-sick",
      delay: 0,
      progressPercent: pendingPercent,
      progressColorClass: "bg-amber-500",
    },
    {
      icon: Check,
      label: "Approved",
      value: approvedCount,
      glow: "success",
      iconColorClass: "text-success",
      delay: 0.05,
      progressPercent: approvedPercent,
      progressColorClass: "bg-emerald-500",
    },
    {
      icon: Plane,
      label: "Vacation Balance",
      value: balanceValue,
      suffix: "d",
      glow: "none",
      iconColorClass: "text-icon-balance",
      delay: 0.1,
      progressPercent: balancePercent,
      progressColorClass: "bg-indigo-500",
    },
    {
      icon: Calendar,
      label: "Total Used Days",
      value: totalUsedDays,
      suffix: "d",
      glow: "none",
      iconColorClass: "text-icon-vacation",
      delay: 0.12,
      progressPercent: usedPercent,
      progressColorClass: "bg-rose-500",
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map((cfg) => (
        <StatCardContent key={cfg.label} {...cfg} isLoading={isLoading} />
      ))}
    </div>
  );
};
