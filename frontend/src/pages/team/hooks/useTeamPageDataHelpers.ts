import type { UserProfile } from "@/types";

export const calcVacationDaysLeft = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  teamBalances: any[] | undefined,
  membersData: UserProfile[],
  filterTeam: string
) => {
  if (!teamBalances || !membersData.length) return 0;
  const today = new Date();
  const currentYear = today.getFullYear();
  const march31 = new Date(currentYear, 2, 31);
  const targetYear = today <= march31 ? currentYear - 1 : currentYear;
  const targetMembers =
    filterTeam === "all"
      ? membersData
      : membersData.filter((m) =>
          (m.teams_detail?.map((t) => t.id.toString()) || []).includes(filterTeam)
        );
  const targetUserIds = new Set(targetMembers.map((m) => m.user.id));
  const vacationBalances = teamBalances.filter(
    (b) => b.leave_type === "vacation" && b.year === targetYear && targetUserIds.has(b.user)
  );
  return vacationBalances.reduce((acc, b) => acc + Math.max(0, Number(b.available_days ?? 0)), 0);
};
