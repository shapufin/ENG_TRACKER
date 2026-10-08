import type { QueryClient } from "@tanstack/react-query";

/** Every query the admin dashboard widgets read; keep in sync with useAdminDashboardQueries. */
export const ADMIN_DASHBOARD_QUERY_KEYS: readonly (readonly string[])[] = [
  ["admin", "overview"],
  ["admin", "trends"],
  ["admin", "people"],
  ["admin", "global-stats"],
];

/**
 * Mark the dashboard aggregates stale after a mutation that changes them
 * (approvals, balances, coverage). Deliberately not the bare ["admin"] prefix,
 * which would refetch every admin list. Inactive queries are only marked stale.
 */
export const invalidateAdminDashboard = async (qc: QueryClient): Promise<void> => {
  await Promise.all(
    ADMIN_DASHBOARD_QUERY_KEYS.map((queryKey) =>
      qc.invalidateQueries({ queryKey: [...queryKey], refetchType: "active" })
    )
  );
};
