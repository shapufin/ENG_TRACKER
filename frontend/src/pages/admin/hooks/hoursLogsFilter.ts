import { useState } from "react";
import { useUrlParamState } from "@/hooks/useUrlParamState";

export type HoursLogStatus = "all" | "pending" | "approved" | "rejected";

const HOURS_STATUSES: readonly HoursLogStatus[] = ["all", "pending", "approved", "rejected"];

export const useHoursLogsFilterState = () => {
  // ?status= so dashboard insights can deep-link to the pending queue.
  const [filterStatus, setStatus] = useUrlParamState("status", HOURS_STATUSES, "all");
  const [dateFrom, setFrom] = useState("");
  const [dateTo, setTo] = useState("");
  const [searchQuery, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // Any filter change starts again from the first page.
  const resetting =
    <V>(set: (value: V) => void) =>
    (value: V) => {
      set(value);
      setPage(1);
    };
  return {
    filterStatus,
    setFilterStatus: resetting(setStatus),
    dateFrom,
    setDateFrom: resetting(setFrom),
    dateTo,
    setDateTo: resetting(setTo),
    searchQuery,
    setSearchQuery: resetting(setSearch),
    page,
    setPage,
  };
};
