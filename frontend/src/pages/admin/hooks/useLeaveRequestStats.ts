import { useMemo } from "react";
import type { LeaveRequest } from "@/types";

export interface LeaveRequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  vacation: number;
  sick: number;
}

export const useLeaveRequestStats = (
  requests: LeaveRequest[] | { results: LeaveRequest[] } | undefined
): LeaveRequestStats => {
  const allRequests = useMemo(() => {
    const results = Array.isArray(requests) ? requests : requests?.results;
    return results ?? [];
  }, [requests]);

  return useMemo(
    () => ({
      total: allRequests.length,
      pending: allRequests.filter((r) => r.status === "pending").length,
      approved: allRequests.filter((r) => r.status === "approved").length,
      rejected: allRequests.filter((r) => r.status === "rejected").length,
      vacation: allRequests.filter((r) => r.request_type === "vacation").length,
      sick: allRequests.filter((r) => r.request_type === "sick").length,
    }),
    [allRequests]
  );
};
