import { useMemo } from "react";
import { usePendingMonths } from "./usePendingMonths";

/**
 * Total pending approval count for the sidebar nav badge (mockup: amber
 * count pill on "Pending Approvals").
 *
 * Reuses `usePendingMonths` (same query keys + 30s staleTime), so the badge
 * shares the approval dashboard's cache and refreshes in real time when
 * approval mutations invalidate the pending-months queries. Returns 0 (no
 * badge) when team management is off or while loading.
 */
export const usePendingApprovalCount = (canManageTeam: boolean) => {
  const { overtime, standby, leave } = usePendingMonths({ canManageTeam });
  const total = useMemo(() => {
    if (!canManageTeam) return 0;
    const sum = (rows: { count: number }[]) => rows.reduce((acc, r) => acc + r.count, 0);
    return sum(overtime) + sum(standby) + sum(leave);
  }, [canManageTeam, overtime, standby, leave]);
  return { total };
};
