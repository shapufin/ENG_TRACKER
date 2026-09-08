import React from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { CircularProgress } from "@/components/dashboard/CircularProgress";
import { StatusRow } from "@/components/dashboard/StatusRow";

interface StatusDatum {
  name: string;
  value: number;
}

interface ApprovalStatusWidgetProps {
  statusData: StatusDatum[];
  isLoading?: boolean;
}

const StatusSkeleton: React.FC = () => (
  <div className="flex flex-col gap-6 p-4">
    <div className="flex justify-center">
      <div className="h-40 w-40 animate-pulse rounded-full bg-muted/40" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/40" />
      ))}
    </div>
  </div>
);

/**
 * Reads the canonical 5-element `statusData` produced by
 * `computeAdminDashboardSummary`:
 *   [Pending OT, Pending SB, Pending Leave, Approved, Rejected]
 * Lookup is by name so reordering does not silently break the widget.
 */
export const ApprovalStatusWidget: React.FC<ApprovalStatusWidgetProps> = ({
  statusData,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <ChartCard title="Approval Status" description="All request types" delay={0.25}>
        <StatusSkeleton />
      </ChartCard>
    );
  }
  const find = (name: string) => statusData.find((d) => d.name === name)?.value ?? 0;
  const pendingOT = find("Pending OT");
  const pendingSB = find("Pending SB");
  const pendingLeave = find("Pending Leave");
  const approved = find("Approved");
  const rejected = find("Rejected");
  const pending = pendingOT + pendingSB + pendingLeave;
  const total = approved + pending + rejected;
  const approvedPct = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <ChartCard title="Approval Status" description="All request types" delay={0.25}>
      <div className="flex flex-col gap-6 p-4">
        <div className="flex justify-center">
          <CircularProgress percentage={approvedPct} label="Approved" />
        </div>
        <div className="space-y-3">
          <StatusRow label="Approved" value={approved} color="bg-emerald-600" />
          <StatusRow label="Pending" value={pending} color="bg-amber-600" />
          <StatusRow label="Rejected" value={rejected} color="bg-red-600" />
        </div>
      </div>
    </ChartCard>
  );
};
