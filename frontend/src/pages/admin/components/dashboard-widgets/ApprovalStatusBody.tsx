import React from "react";
import { CircularProgress } from "@/components/dashboard/CircularProgress";
import { StatusRow } from "@/components/dashboard/StatusRow";

interface StatusDatum {
  name: string;
  value: number;
}

interface ApprovalStatusBodyProps {
  statusData: StatusDatum[];
  isLoading?: boolean;
}

const StatusSkeleton: React.FC = () => (
  <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
    <div className="flex justify-center">
      <div className="bg-muted/40 h-40 w-40 animate-pulse rounded-full" />
    </div>
    <div className="w-full max-w-xs space-y-2.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-muted/40 h-12 animate-pulse rounded-xl" />
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
export const ApprovalStatusBody: React.FC<ApprovalStatusBodyProps> = ({
  statusData,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading approval status">
        <StatusSkeleton />
      </div>
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
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
      <CircularProgress percentage={approvedPct} label="Approved" />
      <div className="w-full max-w-xs space-y-2.5">
        <StatusRow label="Approved" value={approved} color="bg-emerald-600" />
        <StatusRow label="Pending" value={pending} color="bg-amber-600" />
        <StatusRow label="Rejected" value={rejected} color="bg-red-600" />
      </div>
    </div>
  );
};
