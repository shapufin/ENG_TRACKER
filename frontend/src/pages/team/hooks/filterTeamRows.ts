type Row = {
  user: number;
  status: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  user_full_name?: string;
  user_name?: string;
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
const matchesDateRange = (
  dateValue: string | undefined,
  dateFrom: string,
  dateTo: string,
  cmp: "from" | "to"
) => {
  if (!dateValue) return true;
  const date = new Date(dateValue);
  if (cmp === "from" && dateFrom) return date >= new Date(dateFrom);
  if (cmp === "to" && dateTo) return date <= new Date(dateTo);
  return true;
};

const matchesDate = (row: Row, dateFrom: string, dateTo: string) =>
  matchesDateRange(row.date, dateFrom, dateTo, "from") &&
  matchesDateRange(row.date, dateFrom, dateTo, "to") &&
  matchesDateRange(row.start_date, dateFrom, dateTo, "from") &&
  matchesDateRange(row.end_date, dateFrom, dateTo, "to");

// fallow-ignore-next-line complexity
const matchesSearch = (row: Row, normalizedSearch: string) => {
  if (!normalizedSearch) return true;
  const userName = (row.user_full_name || row.user_name || "").toLowerCase();
  const desc = (row.description || row.reason || "").toLowerCase();
  return userName.includes(normalizedSearch) || desc.includes(normalizedSearch);
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
  }
) => {
  const { filterStatus, filterTeam, dateFrom, dateTo, normalizedSearch, userTeamMap } = options;
  if (!rows) return [] as T[];
  return rows
    .filter(
      (row) =>
        matchesStatus(row, filterStatus) &&
        matchesTeam(row, filterTeam, userTeamMap) &&
        matchesDate(row, dateFrom, dateTo) &&
        matchesSearch(row, normalizedSearch)
    )
    .sort((a, b) => rowDate(b) - rowDate(a));
};
