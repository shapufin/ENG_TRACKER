import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { DataTableCardSpec } from "@/components/ui/DataTableCards";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toneTextClass } from "@/components/ui/tone";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import type { DetailedUserReport } from "@/services/reportService";

/** Phone card: person and team, then the monthly totals. */
const PERSONNEL_CARD: DataTableCardSpec = {
  title: "identity",
  status: "team",
  meta: ["overtime", "standby", "leave", "balance"],
};

interface HRPersonnelTableProps {
  users: DetailedUserReport[];
}

type SortPreset = "name" | "overtime" | "standby" | "leave";

const SORT_PRESETS: { value: SortPreset; label: string }[] = [
  { value: "name", label: "A-Z" },
  { value: "overtime", label: "Highest Overtime" },
  { value: "standby", label: "Highest Standby" },
  { value: "leave", label: "Most Leaves" },
];

const presetValue: Record<Exclude<SortPreset, "name">, (u: DetailedUserReport) => number> = {
  overtime: (u) => u.overtime?.total_hours ?? 0,
  standby: (u) => u.standby?.total_hours ?? 0,
  leave: (u) => u.leave?.total_days ?? 0,
};

const Pair: React.FC<{ total: number; approved: number }> = ({ total, approved }) => (
  <span className="font-mono tabular-nums">
    <span className="font-bold">{total}</span>
    <span className={toneTextClass.success}>/{approved}</span>
  </span>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-line-subtle flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-mono font-semibold tabular-nums">{value}</dd>
  </div>
);

const HRPersonnelDetailPanel: React.FC<{ user: DetailedUserReport; onClose: () => void }> = ({
  user: u,
  onClose,
}) => (
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
            value={`${u.overtime?.total_hours ?? 0}h (${u.overtime?.approved_hours ?? 0}h approved)`}
          />
          <DetailRow
            label="Standby"
            value={`${u.standby?.total_hours ?? 0}h (${u.standby?.approved_hours ?? 0}h approved)`}
          />
          <DetailRow
            label="Leave taken"
            value={`${u.leave?.total_days ?? 0} days (${u.leave?.approved_days ?? 0} approved)`}
          />
          <DetailRow label="Balance left" value={`${u.leave_balance ?? 0} days`} />
        </dl>
      </DialogBody>
    </DialogContent>
  </Dialog>
);

export const HRPersonnelTable: React.FC<HRPersonnelTableProps> = ({ users }) => {
  const [selected, setSelected] = useState<DetailedUserReport | null>(null);
  const [preset, setPreset] = useState<SortPreset>("name");

  // A preset orders the rows we hand to the table; a header click still re-sorts on top of it.
  const ordered = useMemo(
    () =>
      [...users].sort((a, b) =>
        preset === "name"
          ? a.full_name.localeCompare(b.full_name)
          : presetValue[preset](b) - presetValue[preset](a)
      ),
    [users, preset]
  );

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
          <Badge
            variant="secondary"
            className="bg-muted text-xs font-bold tracking-tighter uppercase"
          >
            {row.original.team || "Unassigned"}
          </Badge>
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
          />
        ),
      },
      {
        id: "balance",
        header: "Balance Left",
        accessorFn: (u) => u.leave_balance ?? 0,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums">{row.original.leave_balance ?? 0}</span>
        ),
      },
    ],
    []
  );

  return (
    <GlassCard className="space-y-4 p-5">
      <CardHeader className="p-0">
        <CardTitle className="text-sm font-semibold">Identity Breakdown (Aggregated)</CardTitle>
      </CardHeader>
      <FilterChipRow
        label="Quick sort"
        options={SORT_PRESETS}
        selected={[preset]}
        onToggle={setPreset}
      />
      <DataTable
        columns={columns}
        data={ordered}
        getRowId={(u) => String(u.user_id)}
        searchColumn={["full_name", "username"]}
        searchPlaceholder="Search people..."
        emptyMessage="No users found."
        onRowClick={setSelected}
        mobileCard={PERSONNEL_CARD}
      />
      {selected && <HRPersonnelDetailPanel user={selected} onClose={() => setSelected(null)} />}
    </GlassCard>
  );
};
