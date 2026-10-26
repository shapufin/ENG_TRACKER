import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
};

export const useHbprAssignmentColumns = (
  onEnd: (row: HbprAssignment) => void,
  onEdit: (row: HbprAssignment) => void
): AppColumnDef<HbprAssignment>[] =>
  useMemo(
    () => [
      {
        id: "hbpr",
        accessorFn: (row) => row.hbpr_detail.name,
        header: "HR Business Partner",
        size: 190,
        cell: ({ row }) => (
          <span className="text-foreground font-medium">
            {row.original.hbpr_detail.name}
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              #{row.original.hbpr}
            </span>
          </span>
        ),
      },
      {
        id: "albanian_tl",
        accessorFn: (row) => row.albanian_tl_detail.name,
        header: "Albanian team leader",
        size: 190,
        cell: ({ row }) => (
          <span className="text-foreground font-medium">
            {row.original.albanian_tl_detail.name}
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              #{row.original.albanian_tl}
            </span>
          </span>
        ),
      },
      {
        id: "cadence",
        accessorKey: "cadence",
        header: "Cadence",
        size: 160,
        cell: ({ row }) => row.original.cadence_display || CADENCE_LABELS[row.original.cadence],
      },
      {
        id: "cadence_status",
        accessorKey: "cadence_status",
        header: "Status",
        size: 110,
        cell: ({ row }) => (
          <Badge variant={STATUS_TONE[row.original.cadence_status]} className="whitespace-nowrap">
            {CADENCE_STATUS_LABELS[row.original.cadence_status]}
          </Badge>
        ),
      },
      {
        id: "next_due_on",
        accessorKey: "next_due_on",
        header: "Next due",
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.next_due_on ?? "—"}
          </span>
        ),
      },
      {
        id: "effective_from",
        accessorKey: "effective_from",
        header: "Effective from",
        size: 139,
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.effective_from}
          </span>
        ),
      },
      {
        id: "effective_to",
        accessorKey: "effective_to",
        header: "Effective to",
        size: 122,
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.effective_to ?? "—"}
          </span>
        ),
      },
      {
        id: "evidence_count",
        accessorKey: "evidence_count",
        header: "Log entries",
        size: 119,
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
        meta: { actionsDisplay: "column" },
        header: "Actions",
        size: 150,
        cell: ({ row }) =>
          row.original.is_current ? (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                aria-label={`Edit assignment for ${row.original.albanian_tl_detail.name}`}
                onClick={() => onEdit(row.original)}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={`End assignment between ${row.original.hbpr_detail.name} and ${row.original.albanian_tl_detail.name}`}
                onClick={() => onEnd(row.original)}
              >
                End
              </Button>
            </div>
          ) : null,
      },
    ],
    [onEnd, onEdit]
  );
