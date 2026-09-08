import { useMemo, useState } from "react";

export type HoursLogStatus = "all" | "pending" | "approved" | "rejected";

interface HoursLog {
  id: number;
  user_name?: string;
  date: string;
  description?: string | null;
  status: string;
}

export const useHoursLogsFilterState = () => {
  const [filterStatus, setFilterStatus] = useState<HoursLogStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  return {
    filterStatus,
    setFilterStatus,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
  };
};

export const filterHoursLogs = <T extends HoursLog>(
  logs: T[] | undefined,
  filterStatus: HoursLogStatus,
  dateFrom: string,
  dateTo: string,
  searchQuery: string
): T[] => {
  if (!logs) return [];
  return logs
    .filter((log) => {
      if (filterStatus !== "all" && log.status !== filterStatus) return false;
      if (dateFrom && new Date(log.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(log.date) > new Date(dateTo)) return false;
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        const userName = log.user_name?.toLowerCase() || "";
        const desc = log.description?.toLowerCase() || "";
        if (!userName.includes(search) && !desc.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

export const calculateHoursStats = <T extends HoursLog>(logs: T[] | undefined) => {
  if (!logs) return { total: 0, pending: 0, approved: 0, rejected: 0 };
  return {
    total: logs.length,
    pending: logs.filter((l) => l.status === "pending").length,
    approved: logs.filter((l) => l.status === "approved").length,
    rejected: logs.filter((l) => l.status === "rejected").length,
  };
};

export const useHoursLogsData = <T extends HoursLog>(
  logs: T[] | undefined,
  filterStatus: HoursLogStatus,
  dateFrom: string,
  dateTo: string,
  searchQuery: string
) => {
  const filteredLogs = useMemo(
    () => filterHoursLogs(logs, filterStatus, dateFrom, dateTo, searchQuery),
    [logs, filterStatus, dateFrom, dateTo, searchQuery]
  );
  const stats = useMemo(() => calculateHoursStats(logs), [logs]);
  return { filteredLogs, stats };
};
