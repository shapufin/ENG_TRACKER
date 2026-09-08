/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Plane, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";

interface HRDashboardPendingLeaveProps {
  leaveData: any;
}

export const HRDashboardPendingLeave: React.FC<HRDashboardPendingLeaveProps> = ({ leaveData }) => {
  const pending = (leaveData?.results ?? []).filter((r: any) => r.status === "pending");

  return (
    <GlassCard className="overflow-hidden border-border/70 bg-card">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          Pending Leave Requests
        </h3>
        <Badge variant="outline" className="border-border text-muted-foreground">
          Awaiting Decision
        </Badge>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pending.map((r: any) => (
            <div
              key={r.id}
              className="group flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 p-5 transition-all hover:bg-muted/50"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                  <Plane className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {r.user_name || String(r.user)}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.days_requested} days requested</p>
                </div>
              </div>
              <div
                role="status"
                aria-label="Pending"
                className="h-2 w-2 animate-pulse rounded-full bg-warning"
              />
            </div>
          ))}
          {pending.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={CheckCircle2}
                title="All leave requests have been processed."
                className="p-6"
              />
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
