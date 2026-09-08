import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AggregatedUserRow } from "../utils/rosterAggregation";
import { formatDate } from "../utils/controlRoomFormatters";
import { initialsOf, teamColorFor } from "../utils/crViewHelpers";

// Column defs live here (not in CurrentStandbyRoster.tsx) so the component
// file exports only the component (react-refresh rule). The person-cell
// contrast test renders the user_name cell directly from this def because
// the component test mocks DataTable.
export const rosterColumns: ColumnDef<AggregatedUserRow>[] = [
  {
    accessorKey: "user_name",
    header: "Person",
    cell: ({ row }) => (
      <span className="flex items-center gap-2 font-medium">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-foreground">
          {initialsOf(row.original.user_name)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 truncate" title={row.original.user_name}>
          {row.original.user_name}
          {row.original.has_overnight && (
            <Moon className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
          )}
        </span>
      </span>
    ),
  },
  {
    accessorKey: "team_names",
    header: "Team(s)",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.team_names.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          row.original.team_names.map((t) => (
            <Badge key={t} variant="secondary" className="inline-flex items-center gap-1 text-xs">
              <span className={cn("h-1.5 w-1.5 rounded-full", teamColorFor(t))} />
              {t}
            </Badge>
          ))
        )}
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "shift_count",
    header: "Shifts",
    cell: ({ row }) => <span className="tabular-nums">{row.original.shift_count}</span>,
  },
  {
    id: "date_range",
    header: "Date Range",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(row.original.first_date)} – {formatDate(row.original.last_date)}
      </span>
    ),
    enableSorting: false,
  },
];
