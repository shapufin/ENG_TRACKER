/**
 * CurrentStandbyRoster — aggregated table of people on standby.
 *
 * One row per person (not per shift), showing: name, team(s), shift
 * count, date range. Uses the app-standard GlassCard + DataTable
 * pattern (matching StandbyPage, UsersPage, etc.).
 *
 * Status column removed — the CR dashboard is approved-only and CR
 * users don't need to see pending/rejected status. Total hours column
 * removed — CR users need days (shift count + date range), not hours.
 *
 * Column defs live in ./CurrentStandbyRosterColumns (single source; the
 * contrast test renders the person cell from that def directly).
 */
import React, { useMemo } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { DataTable } from "@/components/ui/DataTable";
import type { ControlRoomRosterRow } from "../types";
import { aggregateByUser } from "../utils/rosterAggregation";
import { rosterColumns } from "./CurrentStandbyRosterColumns";

interface Props {
  roster: ControlRoomRosterRow[];
}

export const CurrentStandbyRoster: React.FC<Props> = ({ roster }) => {
  const aggregated = useMemo(() => aggregateByUser(roster), [roster]);

  if (aggregated.length === 0) {
    return (
      <GlassCard delay={0}>
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No standby entries for the selected period.
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard delay={0} className="p-4">
      <DataTable
        columns={rosterColumns}
        data={aggregated}
        enableColumnVisibility
        storageKey="table-visibility-cr-roster"
        getRowId={(row) => row.id.toString()}
        pageSize={25}
      />
    </GlassCard>
  );
};
