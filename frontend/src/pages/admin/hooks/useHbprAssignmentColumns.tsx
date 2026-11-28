import { useMemo } from "react";
import { Calendar, Pencil, UserMinus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/RowActions";
import { UserCell } from "@/components/admin/UserCell";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import {
  CADENCE_LABELS,
  CADENCE_STATUS_LABELS,
  type HbprAssignment,
  type HbprCadenceStatus,
} from "@/types/hbprAssignment";

const STATUS_TONE: Record<HbprCadenceStatus, "success" | "warning" | "destructive" | "neutral"> = {
  on_track: "success",
  due: "warning",
  overdue: "destructive",
  not_started: "neutral",
  ended: "neutral",
  cadence_not_set: "warning",
};

export const useHbprAssignmentColumns = (
  onEnd: (row: HbprAssignment) => void,
  onEdit: (row: HbprAssignment) => void
): AppColumnDef<HbprAssignment>[] =>
  useMemo(
    () => [
      {
        id: "hbpr",
        meta: { priority: 1 },
        size: 200,
        accessorFn: (row) => row.hbpr_detail.name,
        header: "HR Business Partner",
        cell: ({ row }) => (
          <UserCell
            name={row.original.hbpr_detail.name}
            subtitle={`HBPR · #${row.original.hbpr}`}
          />
        ),
      },
      {
        id: "albanian_tl",
        meta: { priority: 1 },
        size: 200,
        accessorFn: (row) => row.albanian_tl_detail.name,
        header: "Line Manager",
        cell: ({ row }) => (
          <UserCell
            name={row.original.albanian_tl_detail.name}
            subtitle={`Team Leader · #${row.original.albanian_tl}`}
          />
        ),
      },
      {
        id: "cadence",
        meta: { priority: 2 },
        size: 130,
        accessorKey: "cadence",
        header: "Cadence",
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="text-muted-foreground h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {row.original.cadence ? (
              <span className="font-medium">
                {row.original.cadence_display || CADENCE_LABELS[row.original.cadence]}
              </span>
            ) : (
              <Badge variant="warning" className="whitespace-nowrap">
                Not set
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "cadence_status",
        meta: { priority: 1 },
        size: 120,
        accessorKey: "cadence_status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_TONE[row.original.cadence_status]} className="whitespace-nowrap">
            {CADENCE_STATUS_LABELS[row.original.cadence_status]}
          </Badge>
        ),
      },
      {
        id: "next_due_on",
        meta: { priority: 1 },
        size: 110,
        accessorKey: "next_due_on",
        header: "Next due",
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.next_due_on ?? "—"}
          </span>
        ),
      },
      {
        id: "effective_from",
        meta: { priority: 3 },
        size: 120,
        accessorKey: "effective_from",
        header: "Effective from",
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.effective_from}
          </span>
        ),
      },
      {
        id: "effective_to",
        meta: { priority: 3 },
        size: 120,
        accessorKey: "effective_to",
        header: "Effective to",
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.effective_to ?? "—"}
          </span>
        ),
      },
      {
        id: "evidence_count",
        meta: { priority: 3 },
        size: 100,
        accessorKey: "evidence_count",
        header: "Log entries",
        cell: ({ row }) =>
          row.original.evidence_count > 0 ? (
            <Badge variant="neutral" className="whitespace-nowrap">
              {row.original.evidence_count}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        meta: { priority: 1 },
        size: 96,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          if (!row.original.is_current) return null;
          return (
            <RowActions
              actions={[
                {
                  label: `Edit assignment for ${row.original.albanian_tl_detail.name}`,
                  shortLabel: "Edit",
                  icon: Pencil,
                  onClick: () => onEdit(row.original),
                },
                {
                  label: `End assignment between ${row.original.hbpr_detail.name} and ${row.original.albanian_tl_detail.name}`,
                  shortLabel: "End",
                  icon: UserMinus,
                  tone: "warning",
                  onClick: () => onEnd(row.original),
                },
              ]}
            />
          );
        },
      },
    ],
    [onEnd, onEdit]
  );
