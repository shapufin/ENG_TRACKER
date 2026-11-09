type Row = {
  user: number;
  status: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  user_full_name?: string;
  user_name?: string;
  user_code?: string | null;
  description?: string;
  reason?: string;
};

const matchesStatus = (row: Row, filterStatus: string) =>
  filterStatus === "all" || row.status === filterStatus;

const matchesTeam = (row: Row, filterTeam: string, userTeamMap: Map<number, number[]>) => {
  if (filterTeam === "all") return true;
  const userTeamIds = userTeamMap.get(row.user) || [];
  return userTeamIds.includes(Number(filterTeam));
};

// fallow-ignore-next-line complexity
const matchesDate = (row: Row, dateFrom: string, dateTo: string) => {
  if (row.date) {
    const d = row.date.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  }
  if (row.start_date || row.end_date) {
    const start = (row.start_date || row.end_date)!.slice(0, 10);
    const end = (row.end_date || row.start_date)!.slice(0, 10);
    if (dateFrom && end < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  }
  return true;
};

// fallow-ignore-next-line complexity
const matchesSearch = (
  row: Row,
  normalizedSearch: string,
  userSearchMap?: Map<number, string[]>
) => {
  if (!normalizedSearch) return true;
  if (row.user_full_name?.toLowerCase().includes(normalizedSearch)) return true;
  if (row.user_name?.toLowerCase().includes(normalizedSearch)) return true;
  if (row.user_code?.toLowerCase().includes(normalizedSearch)) return true;
  if (row.description?.toLowerCase().includes(normalizedSearch)) return true;
  if (row.reason?.toLowerCase().includes(normalizedSearch)) return true;

  if (userSearchMap) {
    const tokens = userSearchMap.get(row.user);
    if (tokens?.some((token) => token.includes(normalizedSearch))) {
      return true;
    }
  }

  return false;
};

const rowDate = (row: Row) => new Date((row.date || row.start_date)!).getTime();

export const filterTeamRows = <T extends Row>(
  rows: T[] | undefined,
  options: {
    filterStatus: string;
    filterTeam: string;
    dateFrom: string;
    dateTo: string;
    normalizedSearch: string;
    userTeamMap: Map<number, number[]>;
    userSearchMap?: Map<number, string[]>;
  }
) => {
  const {
    filterStatus,
    filterTeam,
    dateFrom,
    dateTo,
    normalizedSearch,
    userTeamMap,
    userSearchMap,
  } = options;
  if (!rows) return [] as T[];
  return rows
    .filter(
      (row) =>
        matchesStatus(row, filterStatus) &&
        matchesTeam(row, filterTeam, userTeamMap) &&
        matchesDate(row, dateFrom, dateTo) &&
        matchesSearch(row, normalizedSearch, userSearchMap)
    )
    .sort((a, b) => rowDate(b) - rowDate(a));
};
