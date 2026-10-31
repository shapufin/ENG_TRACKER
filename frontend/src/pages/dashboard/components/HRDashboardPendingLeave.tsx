import React from "react";
import { Plane, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import type { HROverview } from "@/types";

interface HRDashboardPendingLeaveProps {
  /** Server-filtered pending rows (oldest submission first, capped). */
  items: HROverview["pending_leave"];
  /** Org pending total — may exceed items.length when the cap kicks in. */
  total: number;
}

export const HRDashboardPendingLeave: React.FC<HRDashboardPendingLeaveProps> = ({
  items,
  total,
}) => {
  const hidden = total - items.length;
  return (
    <DashboardSectionShell
      title="Pending Leave Requests"
      badge={
        <Badge variant="outline" className="border-border text-muted-foreground">
          {total} Awaiting Decision
        </Badge>
      }
      bodyClassName="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((r) => (
        <div
          key={r.id}
          className="group flex items-center justify-between rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:bg-muted/50 motion-reduce:transition-none"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
              <Plane className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{r.user_name}</p>
              <p className="text-xs text-muted-foreground">{r.days_requested} days requested</p>
              <p className="text-muted-foreground text-xs">
                {`${formatDateDDMMYYYY(r.start_date)}${
                  r.end_date !== r.start_date ? ` – ${formatDateDDMMYYYY(r.end_date)}` : ""
                }`}
              </p>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="bg-warning h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none"
          />
        </div>
      ))}
      {items.length === 0 && (
        <div className="col-span-full">
          <EmptyState
            icon={CheckCircle2}
            title="All leave requests have been processed."
            className="p-6"
          />
        </div>
      )}
      {hidden > 0 && (
        <p className="text-muted-foreground col-span-full text-xs">
          +{hidden} more pending requests — see Leave Requests for the full queue.
        </p>
      )}
    </DashboardSectionShell>
  );
};
