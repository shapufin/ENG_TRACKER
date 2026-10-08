import { useMemo, useState } from "react";
import type { LeaveRequest } from "@/types";
import { useUrlParamState } from "@/hooks/useUrlParamState";
import { matchesLeaveRequestFilter, sortLeaveRequests } from "./leaveRequestFilterHelpers";

const LEAVE_STATUSES = ["all", "pending", "approved", "rejected"] as const;

export const useLeaveRequestFilters = (
  requests: LeaveRequest[] | { results: LeaveRequest[] } | undefined
) => {
  // ?status= so dashboard insights can deep-link to the pending queue.
  const [filterStatus, setFilterStatus] = useUrlParamState("status", LEAVE_STATUSES, "all");
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "vacation">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const allRequests = useMemo(() => {
    const results = Array.isArray(requests) ? requests : requests?.results;
    return results ?? [];
  }, [requests]);

  const filterOptions = useMemo(
    () => ({ filterStatus, filterUser, filterType, dateFrom, dateTo, searchQuery }),
    [filterStatus, filterUser, filterType, dateFrom, dateTo, searchQuery]
  );

  const filteredRequests = useMemo(
    () =>
      allRequests
        .filter((req) => matchesLeaveRequestFilter(req, filterOptions))
        .sort(sortLeaveRequests),
    [allRequests, filterOptions]
  );

  return {
    filterStatus,
    setFilterStatus,
    filterUser,
    setFilterUser,
    filterType,
    setFilterType,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    searchQuery,
    setSearchQuery,
    filteredRequests,
  };
};
