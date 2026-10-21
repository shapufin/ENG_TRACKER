import { useState } from "react";
import { useUrlParamState } from "@/hooks/useUrlParamState";

const LEAVE_STATUSES = ["all", "pending", "approved", "rejected"] as const;

export const useLeaveRequestFilters = () => {
  // ?status= so dashboard insights can deep-link to the pending queue.
  const [filterStatus, setStatus] = useUrlParamState("status", LEAVE_STATUSES, "all");
  const [filterUser, setUser] = useState<string>("all");
  const [filterType, setType] = useState<"all" | "vacation">("all");
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
    filterUser,
    setFilterUser: resetting(setUser),
    filterType,
    setFilterType: resetting(setType),
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
