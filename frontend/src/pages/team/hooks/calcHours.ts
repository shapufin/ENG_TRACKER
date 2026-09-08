export const calcHours = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logs: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  membersData: any[],
  filterTeam: string,
  dateFrom: string,
  dateTo: string,
  statusCheck: boolean = true
) => {
  if (!logs) return 0;
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const dateFromFilter = dateFrom ? new Date(dateFrom) : null;
  const dateToFilter = dateTo ? new Date(dateTo) : null;
  const filtered = logs.filter((log) => {
    const logDate = new Date(log.date);
    const isCurrentMonth = logDate >= startOfMonth && logDate <= endOfMonth;
    if (dateFromFilter && logDate < dateFromFilter) return false;
    if (dateToFilter && logDate > dateToFilter) return false;
    if (filterTeam !== "all") {
      const member = membersData.find((m) => m.user.id === log.user);
      if (!member) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teamIds = member.teams_detail?.map((t: any) => t.id.toString()) || [];
      if (!teamIds.includes(filterTeam)) return false;
    }
    return isCurrentMonth && (!statusCheck || log.status === "approved");
  });
  return filtered.reduce((acc, log) => acc + Number(log.hours ?? 0), 0);
};
