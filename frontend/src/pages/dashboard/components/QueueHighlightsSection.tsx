import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge, type StatusVariant } from "@/components/ui/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { HighlightFilter, HighlightSort } from "../hooks/useTeamLeaderDashboardUI";

interface QueueHighlight {
  id: number;
  type: string;
  userName: string;
  date: string;
  details: string;
  status: string;
  tag?: string | null;
  hours?: number | null;
  days?: number | null;
}

interface HighlightTypeCounts {
  all: number;
  overtime: number;
  standby: number;
  leave: number;
}

interface QueueHighlightsSectionProps {
  highlights: QueueHighlight[];
  isLoading: boolean;
  isError: boolean;
  typeCounts: HighlightTypeCounts;
  filter: HighlightFilter;
  onFilterChange: (filter: HighlightFilter) => void;
  sort: HighlightSort;
  onSortChange: (sort: HighlightSort) => void;
  onBatchApprove: () => void;
  isBatchApproving: boolean;
  onApproveOne: (id: number, type: string) => void;
  onRejectOne: (id: number, type: string) => void;
  approvingIds?: Set<string>;
  rejectingId?: string | null;
}

const TAG_TONE: Record<string, Tone> = {
  overtime: "warning",
  standby: "info",
  leave: "accent",
};

const FILTER_CHIPS: { key: HighlightFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "standby", label: "Standby" },
  { key: "leave", label: "Leave" },
  { key: "overtime", label: "OT" },
];

export const QueueHighlightsSection: React.FC<QueueHighlightsSectionProps> = ({
  highlights,
  isLoading,
  isError,
  typeCounts,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  onBatchApprove,
  isBatchApproving,
  onApproveOne,
  onRejectOne,
  approvingIds,
  rejectingId = null,
}: QueueHighlightsSectionProps) => {
  const columns = useMemo<ColumnDef<QueueHighlight, unknown>[]>(
    () => [
      {
        accessorKey: "userName",
        header: "Employee",
        enableSorting: false,
        cell: (info) => {
          const item = info.row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">
                  {item.userName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{item.userName}</p>
                {item.tag && (
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full border px-2 py-px text-[11px] font-medium",
                      toneSurfaceClass[TAG_TONE[item.type] ?? "neutral"]
                    )}
                  >
                    {item.tag}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        enableSorting: false,
        cell: (info) => {
          const type = info.getValue<string>();
          return <span className="capitalize">{type}</span>;
        },
      },
      {
        accessorKey: "hours",
        header: "Duration",
        enableSorting: false,
        cell: (info) => {
          const item = info.row.original;
          if (item.hours != null)
            return <span className="font-mono tabular-nums">{item.hours.toFixed(2)}h</span>;
          if (item.days != null)
            return <span className="font-mono tabular-nums">{item.days}d</span>;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        accessorKey: "date",
        header: "Requested",
        enableSorting: false,
        cell: (info) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {format(parseISO(info.getValue<string>()), "dd MMM, yyyy")}
          </span>
        ),
      },
      {
        accessorKey: "details",
        header: "Details",
        enableSorting: false,
        cell: (info) => (
          <span
            className="block max-w-64 truncate text-muted-foreground"
            title={info.getValue<string>()}
          >
            {info.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: (info) => <StatusBadge variant={info.getValue<string>() as StatusVariant} />,
      },
      {
        id: "actions",
        header: () => <span className="block text-right">Actions</span>,
        enableSorting: false,
        cell: (info) => {
          const item = info.row.original;
          const key = `${item.type}-${item.id}`;
          if (item.status !== "pending") return null;
          // Either pending mutation locks both buttons: approving while a
          // reject is in flight (or vice versa) would double-decide the row.
          const isBusy = (approvingIds?.has(key) ?? false) || rejectingId === key;
          const isRejecting = rejectingId === key;
          return (
            <div className="flex items-center justify-end gap-2">
              <Link
                to={`/team/approvals?highlight=${item.id}&type=${item.type}`}
                className="whitespace-nowrap text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Details & Audit
              </Link>
              <Button
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => onRejectOne(item.id, item.type)}
              >
                {isRejecting ? "Rejecting…" : "Reject"}
              </Button>
              <Button size="sm" disabled={isBusy} onClick={() => onApproveOne(item.id, item.type)}>
                {!isRejecting && approvingIds?.has(key) ? "Approving…" : "Approve"}
              </Button>
            </div>
          );
        },
      },
    ],
    [approvingIds, rejectingId, onApproveOne, onRejectOne]
  );

  return (
    <DashboardSectionShell
      title="Queue Highlights"
      subtitle="Review and resolve time-sensitive operational items"
      badge={
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold",
            toneSurfaceClass.danger
          )}
        >
          Action Required
        </span>
      }
      controls={
        <>
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onFilterChange(chip.key)}
              aria-pressed={filter === chip.key}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                filter === chip.key
                  ? toneSurfaceClass.accent
                  : "border border-border/60 text-muted-foreground"
              )}
            >
              {chip.label} ({typeCounts[chip.key]})
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as HighlightSort)}
            className="h-8 rounded-full border border-border/60 bg-input-bg px-3 text-xs font-medium text-muted-foreground"
            aria-label="Sort queue highlights"
          >
            <option value="recent">Sort: Most recent</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <Button
            size="sm"
            onClick={onBatchApprove}
            disabled={isBatchApproving || highlights.length === 0}
          >
            {isBatchApproving ? "Approving…" : "Batch Approve"}
          </Button>
        </>
      }
      bodyClassName="block"
    >
      {isLoading ? (
        <div className="flex animate-pulse items-center gap-3 p-2" aria-label="Loading highlights">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-4 w-24 rounded bg-muted" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Failed to load highlights.</p>
      ) : (
        <DataTable
          columns={columns}
          data={highlights}
          pageSize={5}
          getRowId={(row) => `${row.type}-${row.id}`}
          emptyMessage="No pending approvals detected."
        />
      )}
    </DashboardSectionShell>
  );
};
