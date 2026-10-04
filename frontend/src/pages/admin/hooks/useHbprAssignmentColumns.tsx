import React, { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppColumnDef } from "@/components/ui/tableTypes";
import { CADENCE_LABELS, CADENCE_STATUS_LABELS } from "@/types/hbprAssignment";
import type { HbprAssignment, HbprCadenceStatus } from "@/types/hbprAssignment";

const STATUS_TONE: Record<HbprCadenceStatus, "success" | "warning" | "destructive" | "neutral"> = {
  on_track: "success",
  due: "warning",
  overdue: "destructive",
  not_started: "neutral",
  ended: "neutral",
};

/**
 * Column definitions for the Admin → HBPR assignments table.
 * `onEnd` receives the row being ended so the page can seed the confirm dialog.
 */
export const useHbprAssignmentColumns = (
  onEnd: (row: HbprAssignment) => void
): AppColumnDef<HbprAssignment>[] =>
  useMemo(
    () => [
      {
        id: "hbpr",
        accessorKey: "hbpr_detail.name",
        header: "HBPR",
        size: 180,
        cell: ({ row }) => (
          <span className="text-foreground font-medium">{row.original.hbpr_detail.name}</span>
        ),
      },
      {
        id: "albanian_tl",
        accessorKey: "albanian_tl_detail.name",
        header: "Albanian TL",
        size: 180,
        cell: ({ row }) => row.original.albanian_tl_detail.name,
      },
      {
        id: "cadence",
        accessorKey: "cadence",
        header: "Cadence",
        size: 100,
        cell: ({ row }) => CADENCE_LABELS[row.original.cadence],
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
        size: 120,
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
        size: 110,
        cell: ({ row }) => (
          <span className="font-mono whitespace-nowrap tabular-nums">
            {row.original.effective_to ?? "—"}
          </span>
        ),
      },
      {
        id: "evidence_count",
        accessorKey: "evidence_count",
        header: "Evidence",
        size: 90,
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
        header: "Actions",
        size: 90,
        cell: ({ row }) =>
          row.original.is_current ? (
            <Button
              variant="outline"
              size="sm"
              aria-label={`End assignment between ${row.original.hbpr_detail.name} and ${row.original.albanian_tl_detail.name}`}
              onClick={() => onEnd(row.original)}
            >
              End
            </Button>
          ) : null,
      },
    ],
    [onEnd]
  );
