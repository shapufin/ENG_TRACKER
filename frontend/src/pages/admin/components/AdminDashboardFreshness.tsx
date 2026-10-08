import React, { useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_DASHBOARD_QUERY_KEYS, invalidateAdminDashboard } from "@/lib/adminDashboardKeys";

/** A dashboard query's key starts with one of the dashboard keys (trends adds the period). */
const isDashboardKey = (key: readonly unknown[]) =>
  ADMIN_DASHBOARD_QUERY_KEYS.some((k) => key.length >= k.length && k.every((p, i) => p === key[i]));

const label = (since: number | null, now: number) => {
  if (since === null) return "Updated —";
  const mins = Math.floor((now - since) / 60_000);
  return mins < 1 ? "Updated just now" : `Updated ${mins}m ago`;
};

/** "Updated Nm ago" for the oldest mounted dashboard query, plus a real refresh. */
export const AdminDashboardFreshness: React.FC = () => {
  const qc = useQueryClient();
  const fetching = useIsFetching({ predicate: (q) => isDashboardKey(q.queryKey) }) > 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    // Re-render when any query lands so the stamp never lags behind the data.
    // Observer add/remove events fire while another component renders, so only react
    // to data events, and never set state synchronously from the notification.
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type === "updated") queueMicrotask(() => setNow(Date.now()));
    });
    return () => {
      clearInterval(id);
      unsubscribe();
    };
  }, [qc]);

  const stamps = qc
    .getQueryCache()
    .findAll({ predicate: (q) => isDashboardKey(q.queryKey) })
    .map((q) => q.state.dataUpdatedAt)
    .filter((t) => t > 0);
  const oldest = stamps.length ? Math.min(...stamps) : null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs" aria-live="polite">
        {label(oldest, now)}
      </span>
      <Button
        variant="outline"
        size="control"
        className="px-2.5"
        aria-label="Refresh dashboard"
        aria-busy={fetching}
        disabled={fetching}
        onClick={() => void invalidateAdminDashboard(qc)}
      >
        <RefreshCw
          className={`h-4 w-4 ${fetching ? "motion-safe:animate-spin" : ""}`}
          aria-hidden
        />
      </Button>
    </div>
  );
};
