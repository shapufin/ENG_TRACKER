import React, { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/calendar/UserAvatar";
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
 *
 * Sizes are the measured header/content width plus slack: the previous values
 * were below their own header's minimum (Cadence, Effective from/to, Log
 * entries), so those columns grew past their declared width and the 9-column
 * table ran 82px wider than its 1440px viewport. The two identity columns
 * truncate their name with a tooltip.
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
        size: 130,
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={row.original.hbpr_detail.name} size="sm" />
            <span
              className="text-foreground truncate font-medium"
              title={row.original.hbpr_detail.name}
            >
              {row.original.hbpr_detail.name}
            </span>
          </span>
        ),
      },
      {
        id: "albanian_tl",
        accessorKey: "albanian_tl_detail.name",
        header: "Albanian TL",
        size: 130,
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <UserAvatar name={row.original.albanian_tl_detail.name} size="sm" />
            <span className="truncate" title={row.original.albanian_tl_detail.name}>
              {row.original.albanian_tl_detail.name}
            </span>
          </span>
        ),
      },
      {
        id: "cadence",
        accessorKey: "cadence",
        header: "Cadence",
        size: 108,
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
