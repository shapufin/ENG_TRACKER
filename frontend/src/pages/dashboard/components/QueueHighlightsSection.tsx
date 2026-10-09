import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { DashboardSectionShell } from "@/components/dashboard/DashboardSectionShell";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/Chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const columns = useMemo<AppColumnDef<QueueHighlight, unknown>[]>(
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
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
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
          <span className="text-muted-foreground whitespace-nowrap">
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
            className="text-muted-foreground block max-w-64 truncate"
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
                className="text-muted-foreground hover:text-foreground text-xs font-medium whitespace-nowrap hover:underline"
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
            <Chip
              key={chip.key}
              pressed={filter === chip.key}
              onClick={() => onFilterChange(chip.key)}
              className="text-xs"
            >
              {chip.label} ({typeCounts[chip.key]})
            </Chip>
          ))}
          <Select value={sort} onValueChange={(v) => onSortChange(v as HighlightSort)}>
            <SelectTrigger
              controlSize="sm"
              className="w-44 text-xs"
              aria-label="Sort queue highlights"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Sort: Most recent</SelectItem>
              <SelectItem value="oldest">Sort: Oldest</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="control-sm"
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
          <div className="bg-muted h-8 w-8 rounded-full" />
          <div className="bg-muted h-4 w-40 rounded" />
          <div className="bg-muted h-4 w-24 rounded" />
        </div>
      ) : isError ? (
        <p className="text-destructive text-sm">Failed to load highlights.</p>
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
