import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toneTextClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DetailedUserReport } from "@/services/reportService";

/** Phone card: person and team, then the monthly totals. */
const PERSONNEL_CARD: DataTableCardSpec = {
  title: "identity",
  status: "team",
  meta: ["overtime", "standby", "leave", "balance"],
};

export type SortPreset = "name" | "overtime" | "standby" | "leave";
type ViewMode = "flat" | "by-team";

interface HRPersonnelTableProps {
  users: DetailedUserReport[];
  sortPreset?: SortPreset;
  onSortPresetChange?: (preset: SortPreset) => void;
  onlyWithPending?: boolean;
  onOnlyWithPendingChange?: (next: boolean) => void;
}

const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: "name", label: "A-Z" },
  { value: "overtime", label: "Highest Overtime" },
  { value: "standby", label: "Highest Standby" },
  { value: "leave", label: "Most Leaves" },
];

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: "flat", label: "List" },
  { value: "by-team", label: "By Team" },
];

const presetValue: Record<Exclude<SortPreset, "name">, (u: DetailedUserReport) => number> = {
  overtime: (u) => u.overtime?.total_hours ?? 0,
  standby: (u) => u.standby?.total_hours ?? 0,
  leave: (u) => u.leave?.total_days ?? 0,
};

const userHasPending = (u: DetailedUserReport) =>
  (u.overtime?.pending_hours ?? 0) > 0 ||
  (u.standby?.pending_hours ?? 0) > 0 ||
  (u.leave?.pending_days ?? 0) > 0;

const Pair: React.FC<{
  total: number;
  approved: number;
  pending?: number;
  unit: "h" | "d";
}> = ({ total, approved, pending = 0, unit }) => (
  <span className="inline-flex items-baseline gap-1.5 font-mono tabular-nums">
    <span>
      <span className={total === 0 ? "text-muted-foreground" : "font-bold"}>{total}</span>
      <span className={total === 0 ? "text-muted-foreground" : toneTextClass.success}>
        /{approved}
      </span>
    </span>
    {pending > 0 && (
      <span className={`text-xs font-medium ${toneTextClass.warning}`}>
        +{pending}
        {unit} pending
      </span>
    )}
  </span>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-line-subtle flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-mono font-semibold tabular-nums">{value}</dd>
  </div>
);

const HRPersonnelDetailPanel: React.FC<{
  user: DetailedUserReport;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}> = ({ user: u, index, total, onPrev, onNext, onClose }) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onPrev, onNext]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="right" size="panel">
        <DialogHeader>
          <DialogTitle>{u.full_name}</DialogTitle>
          <DialogDescription>
            @{u.username} · {u.team || "Unassigned"}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl>
            <DetailRow
              label="Overtime"
              value={`${u.overtime?.total_hours ?? 0}h (${u.overtime?.approved_hours ?? 0}h approved${(u.overtime?.pending_hours ?? 0) > 0 ? `, +${u.overtime?.pending_hours}h pending` : ""})`}
            />
            <DetailRow
              label="Standby"
              value={`${u.standby?.total_hours ?? 0}h (${u.standby?.approved_hours ?? 0}h approved${(u.standby?.pending_hours ?? 0) > 0 ? `, +${u.standby?.pending_hours}h pending` : ""})`}
            />
            <DetailRow
              label="Leave taken"
              value={`${u.leave?.total_days ?? 0} days (${u.leave?.approved_days ?? 0} approved${(u.leave?.pending_days ?? 0) > 0 ? `, +${u.leave?.pending_days}d pending` : ""})`}
            />
            <DetailRow label="Balance left" value={`${u.leave_balance ?? 0} days`} />
          </dl>
        </DialogBody>
        {total > 1 && (
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-muted-foreground font-mono text-xs tabular-nums">
              {index + 1} / {total} (↑/↓)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="control-sm"
                onClick={onPrev}
                disabled={index <= 0}
                aria-label="Previous person"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="control-sm"
                onClick={onNext}
                disabled={index >= total - 1}
                aria-label="Next person"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const HRPersonnelTable: React.FC<HRPersonnelTableProps> = ({
  users,
  sortPreset,
  onSortPresetChange,
  onlyWithPending,
  onOnlyWithPendingChange,
}) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [internalPreset, setInternalPreset] = useState<SortPreset>("name");
  const [internalPending, setInternalPending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>({});

  const preset = sortPreset ?? internalPreset;
  const setPreset = (next: SortPreset) => {
    setInternalPreset(next);
    onSortPresetChange?.(next);
  };

  const pendingOnly = onlyWithPending ?? internalPending;
  const togglePendingOnly = () => {
    const next = !pendingOnly;
    setInternalPending(next);
    onOnlyWithPendingChange?.(next);
  };

  const pendingCount = useMemo(() => users.filter(userHasPending).length, [users]);

  // A preset orders the rows we hand to the table; a header click still re-sorts on top of it.
  const ordered = useMemo(() => {
    const base = pendingOnly ? users.filter(userHasPending) : users;
    return [...base].sort((a, b) =>
      preset === "name"
        ? a.full_name.localeCompare(b.full_name)
        : presetValue[preset](b) - presetValue[preset](a)
    );
  }, [users, preset, pendingOnly]);

  const teamGroups = useMemo(() => {
    if (viewMode !== "by-team") return [];
    const map = new Map<string, DetailedUserReport[]>();
    for (const u of ordered) {
      const key = u.team || "Unassigned";
      const list = map.get(key) ?? [];
      list.push(u);
      map.set(key, list);
    }
    return [...map.entries()].map(([team, members]) => ({ team, members }));
  }, [ordered, viewMode]);

  const selectedIndex = useMemo(
    () => (selectedId === null ? -1 : ordered.findIndex((u) => u.user_id === selectedId)),
    [ordered, selectedId]
  );
  const selectedUser = selectedIndex >= 0 ? ordered[selectedIndex] : null;

  const handlePrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedId(ordered[selectedIndex - 1].user_id);
  }, [ordered, selectedIndex]);

  const handleNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < ordered.length - 1) {
      setSelectedId(ordered[selectedIndex + 1].user_id);
    }
  }, [ordered, selectedIndex]);

  const columns = useMemo<AppColumnDef<DetailedUserReport>[]>(
    () => [
      {
        id: "identity",
        header: "Identity",
        accessorFn: (u) => u.full_name,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold">{row.original.full_name}</span>
            <span className="text-muted-foreground font-mono text-xs">
              @{row.original.username}
            </span>
          </div>
        ),
      },
      {
        id: "team",
        header: "Team",
        accessorFn: (u) => u.team || "Unassigned",
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.team || "Unassigned"}
          </span>
        ),
      },
      {
        id: "overtime",
        header: "Overtime (Total/Appr)",
        accessorFn: (u) => u.overtime?.total_hours ?? 0,
        cell: ({ row }) => (
          <Pair
            total={row.original.overtime?.total_hours ?? 0}
            approved={row.original.overtime?.approved_hours ?? 0}
            pending={row.original.overtime?.pending_hours ?? 0}
            unit="h"
          />
        ),
      },
      {
        id: "standby",
        header: "Standby (Total/Appr)",
        accessorFn: (u) => u.standby?.total_hours ?? 0,
        cell: ({ row }) => (
          <Pair
            total={row.original.standby?.total_hours ?? 0}
            approved={row.original.standby?.approved_hours ?? 0}
            pending={row.original.standby?.pending_hours ?? 0}
            unit="h"
          />
        ),
      },
      {
        id: "leave",
        header: "Leaves (Total/Appr)",
        accessorFn: (u) => u.leave?.total_days ?? 0,
        cell: ({ row }) => (
          <Pair
            total={row.original.leave?.total_days ?? 0}
            approved={row.original.leave?.approved_days ?? 0}
            pending={row.original.leave?.pending_days ?? 0}
            unit="d"
          />
        ),
      },
      {
        id: "balance",
        header: "Balance Left",
        accessorFn: (u) => u.leave_balance ?? 0,
        cell: ({ row }) => {
          const bal = row.original.leave_balance ?? 0;
          return (
            <span
              className={cn(
                "font-mono tabular-nums",
                bal <= 5 && `font-semibold ${toneTextClass.warning}`
              )}
            >
              {bal}d
            </span>
          );
        },
      },
    ],
    []
  );

  const pendingChip =
    pendingCount > 0 ? (
      <Chip pressed={pendingOnly} onClick={togglePendingOnly}>
        With pending ({pendingCount})
      </Chip>
    ) : undefined;

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="border-border/60 flex flex-col gap-3 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Identity Breakdown (Aggregated)</h3>
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            · {ordered.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FilterChipRow
            label="Quick sort"
            options={SORT_PRESETS}
            selected={[preset]}
            onToggle={setPreset}
          />
          <FilterChipRow
            label="View"
            options={VIEW_MODES}
            selected={[viewMode]}
            onToggle={setViewMode}
          />
        </div>
      </div>

      {viewMode === "flat" ? (
        <DataTable
          embedded
          columns={columns}
          data={ordered}
          getRowId={(u) => String(u.user_id)}
          searchColumn={["full_name", "username"]}
          searchPlaceholder="Search people..."
          toolbarActions={pendingChip}
          emptyMessage="No users found."
          onRowClick={(u) => setSelectedId(u.user_id)}
          mobileCard={PERSONNEL_CARD}
        />
      ) : (
        <div className="space-y-2 p-4">
          {teamGroups.map(({ team, members }) => {
            const isCollapsed = collapsedTeams[team] ?? false;
            return (
              <div key={team} className="border-border/60 overflow-hidden rounded-xl border">
                <button
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() => setCollapsedTeams((prev) => ({ ...prev, [team]: !isCollapsed }))}
                  className={cn(
                    "bg-muted/25 hover:bg-muted/45 flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left text-xs transition-colors",
                    !isCollapsed && "border-border/60 border-b"
                  )}
                >
                  <span className="flex items-center gap-2 font-mono font-semibold">
                    <ChevronDown
                      className={cn(
                        "text-muted-foreground h-4 w-4 transition-transform",
                        isCollapsed && "-rotate-90"
                      )}
                    />
                    {team}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {members.length} {members.length === 1 ? "person" : "people"}
                  </span>
                </button>
                {!isCollapsed && (
                  <DataTable
                    embedded
                    columns={columns}
                    data={members}
                    getRowId={(u) => String(u.user_id)}
                    emptyMessage="No users found."
                    onRowClick={(u) => setSelectedId(u.user_id)}
                    mobileCard={PERSONNEL_CARD}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedUser && (
        <HRPersonnelDetailPanel
          user={selectedUser}
          index={selectedIndex}
          total={ordered.length}
          onPrev={handlePrev}
          onNext={handleNext}
          onClose={() => setSelectedId(null)}
        />
      )}
    </GlassCard>
  );
};
