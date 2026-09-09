import { deriveVacationBalanceFromBalances } from "./vacation-balance";
import type { LeaveBalance } from "@/types";

export const formatDays = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(1));
  return rounded % 1 === 0 ? rounded.toString() : rounded.toString();
};

export const buildMetricBars = (
  vacationSummary: ReturnType<typeof deriveVacationBalanceFromBalances> | null
) => {
  const totalVacationDays = vacationSummary?.totalDays ?? 0;
  const remainingDays = vacationSummary?.remainingDays ?? 0;
  const usedDays = vacationSummary?.usedDays ?? 0;
  const pendingDays = vacationSummary?.pendingDays ?? 0;
  return [
    {
      label: "Remaining",
      value: `${formatDays(remainingDays)}d of ${formatDays(totalVacationDays)}d`,
      progress:
        totalVacationDays > 0 ? Math.min(100, (remainingDays / totalVacationDays) * 100) : 0,
      colorClass: "bg-primary",
    },
    {
      label: "Used",
      value: `${formatDays(usedDays)}d of ${formatDays(totalVacationDays)}d`,
      progress: totalVacationDays > 0 ? Math.min(100, (usedDays / totalVacationDays) * 100) : 0,
      colorClass: "bg-pink-500",
    },
    {
      label: "Pending",
      value: `${formatDays(pendingDays)}d of ${formatDays(totalVacationDays)}d`,
      progress: totalVacationDays > 0 ? Math.min(100, (pendingDays / totalVacationDays) * 100) : 0,
      colorClass: "bg-amber-500",
    },
  ];
};

export const computeCarryOverAndBalance = (balances: LeaveBalance[]) => {
  const carryOver = balances.find((b) => b.leave_type === "vacation" && b.is_carry_over);
  const currentBalance = balances.find((b) => b.leave_type === "vacation" && !b.is_carry_over);
  return { carryOver, currentBalance };
};
