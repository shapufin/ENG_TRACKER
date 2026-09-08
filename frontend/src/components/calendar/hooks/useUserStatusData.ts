import { useMemo } from "react";
import { isAfter } from "date-fns";
import { deriveVacationBalanceFromBalances } from "@/lib/vacation-balance";
import type { LeaveBalance, PublicHoliday } from "@/types";
import { computeProgress, computeCarryOverProgress } from "./userStatusHelpers";

const getUpcomingHolidays = (holidays: PublicHoliday[]) =>
  (holidays ?? [])
    .filter((holiday) => isAfter(new Date(holiday.date), new Date()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

// fallow-ignore-next-line complexity
export const useUserStatusData = (
  vacationBalances: LeaveBalance[] = [],
  holidays: PublicHoliday[] = []
) => {
  const vacationSummary = useMemo(
    () => deriveVacationBalanceFromBalances(vacationBalances),
    [vacationBalances]
  );
  const upcomingHolidays = useMemo(() => getUpcomingHolidays(holidays), [holidays]);

  const hasBalanceData = vacationBalances && vacationBalances.length > 0;

  const remainingDays = vacationSummary?.remainingDays ?? 0;
  const usedDays = vacationSummary?.usedDays ?? 0;
  const pendingDays = vacationSummary?.pendingDays ?? 0;
  const totalDays = vacationSummary?.totalDays ?? 0;
  const vacationYear = vacationSummary?.year ?? new Date().getFullYear();
  const carryOverDetail = vacationSummary?.carryOver;
  const currentDetail = vacationSummary?.current;

  const totalSafe = totalDays > 0 ? totalDays : 1;
  const remainingProgress = computeProgress(remainingDays, totalSafe);
  const usedProgress = computeProgress(usedDays, totalSafe);
  const pendingProgress = computeProgress(pendingDays, totalSafe);
  const carryOverProgress = computeCarryOverProgress(carryOverDetail);

  return {
    hasBalanceData,
    remainingDays,
    usedDays,
    pendingDays,
    totalDays,
    vacationYear,
    carryOverDetail,
    currentDetail,
    remainingProgress,
    usedProgress,
    pendingProgress,
    carryOverProgress,
    upcomingHolidays,
  };
};
