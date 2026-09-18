import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
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
}) => {
  return (
    <GlassCard className="border border-border/60 bg-background/50">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <h3 className="text-lg font-semibold">Queue highlights</h3>
        <div className="flex flex-wrap items-center gap-2">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onFilterChange(chip.key)}
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
            className="h-8 rounded-md border border-input bg-input-bg px-2 text-xs"
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
            Batch Approve
          </Button>
        </div>
      </div>
      <div className="grid gap-4 p-5 pt-0 md:grid-cols-2">
        {isLoading && (
          <>
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between rounded-2xl border border-border/60 bg-background/60 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-muted" />
                  <div className="space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-32 rounded bg-muted" />
                  </div>
                </div>
                <div className="h-6 w-16 rounded-full bg-muted" />
              </div>
            ))}
          </>
        )}
        {isError && (
          <p className="col-span-full text-sm text-destructive">Failed to load highlights.</p>
        )}
        {highlights.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 transition hover:border-primary/30"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {item.userName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{item.userName}</p>
                    {item.tag && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          toneSurfaceClass[TAG_TONE[item.type] ?? "neutral"]
                        )}
                      >
                        {item.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.type.charAt(0).toUpperCase() + item.type.slice(1)} •{" "}
                    {format(parseISO(item.date), "dd MMM")}
                  </p>
                  <p className="text-sm text-muted-foreground/60">{item.details}</p>
                </div>
              </div>
              <StatusBadge variant={item.status as StatusVariant} />
            </div>
            {item.status === "pending" && (
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <a
                  href={`/team/approvals?highlight=${item.id}&type=${item.type}`}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  Details & Audit
                </a>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRejectOne(item.id, item.type)}
                  >
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => onApproveOne(item.id, item.type)}>
                    Approve
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!isLoading && !isError && highlights.length === 0 && (
          <p className="text-sm text-muted-foreground">No pending approvals detected.</p>
        )}
      </div>
    </GlassCard>
  );
};
