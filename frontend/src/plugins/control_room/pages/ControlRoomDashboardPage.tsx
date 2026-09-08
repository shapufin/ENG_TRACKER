/**
 * ControlRoomDashboardPage — main dashboard page for Control Room users.
 *
 * This is the primary UI for CR users (regular employees with
 * `ControlRoomAccess`). They have no overtime/leave/holiday access —
 * only standby for their scoped teams.
 *
 * Three swappable view modes (overview removed — was messy/ugly):
 *   roster   — aggregated table, one row per person (GlassCard + DataTable)
 *   by-team  — one GlassCard per team, aggregated users inside
 *   by-day   — day-by-day columns of who is on standby
 *
 * Approved-only: status filter removed, hardcoded in the hook. CR users
 * see a clean read-only view of who is on standby — no pending/rejected.
 *
 * Orchestrates only. Business logic belongs in hooks/services.
 * Page → Hook → Service → API (CONTEXT.md rule #3).
 */
import React, { useState, useCallback } from "react";
import { startOfWeek, endOfWeek } from "date-fns";
import { PageShell } from "@/components/layout/PageShell";
import { toLocalISODate } from "@/lib/date-format-utils";
import { formatDateCompact } from "../utils/controlRoomFormatters";
import { useControlRoomMe } from "../hooks/useControlRoomAccess";
import { useControlRoomDashboard } from "../hooks/useControlRoomDashboard";
import { ControlRoomFilters } from "../components/ControlRoomFilters";
import { CurrentStandbyRoster } from "../components/CurrentStandbyRoster";
import { ControlRoomEmptyState } from "../components/ControlRoomEmptyState";
import { CRViewTabs, type CRViewMode } from "../components/CRViewTabs";
import { CRByTeamView } from "../components/CRByTeamView";
import { CRByDayView } from "../components/CRByDayView";
import { CRWeekView } from "../components/CRWeekView";

// Default range = current calendar month (1st → last day). CR users
// observe standby coverage for their scoped teams; a monthly window is
// the natural planning horizon and surfaces past shifts immediately.
// Uses toLocalISODate to avoid UTC timezone shifts that off-by-one the
// first/last day in positive UTC offsets.
const startOfMonthISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
const endOfMonthISO = () => {
  const last = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return toLocalISODate(last);
};

// Current week range (Monday → Sunday). The "This Week" tab always shows
// the current week regardless of the date range filter.
const startOfWeekISO = () => toLocalISODate(startOfWeek(new Date(), { weekStartsOn: 1 }));
const endOfWeekISO = () => toLocalISODate(endOfWeek(new Date(), { weekStartsOn: 1 }));

type EmptyReason = "error" | "no_access" | "no_teams" | "no_data" | null;

const getEmptyReason = (
  isError: boolean,
  hasAccess: boolean,
  hasTeams: boolean,
  standbyEntryCount?: number
): EmptyReason => {
  if (isError) return "error";
  if (!hasAccess) return "no_access";
  if (!hasTeams) return "no_teams";
  if (standbyEntryCount === 0) return "no_data";
  return null;
};

const DashboardLoadingState: React.FC = () => (
  <PageShell title="Control Room" subtitle="Standby coverage dashboard">
    <div className="flex h-64 items-center justify-center">
      <div className="text-muted-foreground">Loading Control Room...</div>
    </div>
  </PageShell>
);

const DashboardUnavailableState: React.FC<{ reason: "no_access" | "no_teams" }> = ({ reason }) => (
  <PageShell title="Control Room" subtitle="Standby coverage dashboard">
    <ControlRoomEmptyState reason={reason} />
  </PageShell>
);

type DashboardViewContentProps = {
  emptyReason: EmptyReason;
  viewMode: CRViewMode;
  weekRoster: Parameters<typeof CRWeekView>[0]["roster"];
  roster: Parameters<typeof CurrentStandbyRoster>[0]["roster"];
  coverage: Parameters<typeof CRByTeamView>[0]["coverage"];
  onViewModeChange: (mode: CRViewMode) => void;
};

const DashboardViewContent: React.FC<DashboardViewContentProps> = ({
  emptyReason,
  viewMode,
  weekRoster,
  roster,
  coverage,
  onViewModeChange,
}) =>
  emptyReason ? (
    <ControlRoomEmptyState reason={emptyReason} />
  ) : (
    <>
      <CRViewTabs value={viewMode} onChange={onViewModeChange} />
      {viewMode === "this-week" && <CRWeekView roster={weekRoster} />}
      {viewMode === "roster" && <CurrentStandbyRoster roster={roster} />}
      {viewMode === "by-team" && <CRByTeamView coverage={coverage} roster={roster} />}
      {viewMode === "by-day" && <CRByDayView roster={roster} />}
    </>
  );

export const ControlRoomDashboardPage: React.FC = () => {
  const meQuery = useControlRoomMe();
  const [dateFrom, setDateFrom] = useState(startOfMonthISO());
  const [dateTo, setDateTo] = useState(endOfMonthISO());
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [rosterPage, setRosterPage] = useState(1);
  const [viewMode, setViewMode] = useState<CRViewMode>("this-week");

  // Any filter change resets roster pagination to page 1.
  const resetPage = useCallback(() => setRosterPage(1), []);
  const wrapFilterChange =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      resetPage();
    };

  const hasAccess = meQuery.data?.has_access ?? false;
  const hasTeams = (meQuery.data?.team_ids?.length ?? 0) > 0 || meQuery.data?.is_global === true;

  const dashboard = useControlRoomDashboard({
    dateFrom,
    dateTo,
    selectedTeamIds,
    search,
    rosterPage,
    enabled: hasAccess,
  });

  // Separate query for the "This Week" tab — always current week (Mon→Sun),
  // independent of the date range filter. Only fetches when the tab is active
  // to avoid unnecessary requests. Respects the team filter.
  const weekDashboard = useControlRoomDashboard({
    dateFrom: startOfWeekISO(),
    dateTo: endOfWeekISO(),
    selectedTeamIds,
    search: "",
    rosterPage: 1,
    enabled: hasAccess && viewMode === "this-week",
  });

  const coverage = dashboard.summary?.coverage_by_team ?? [];

  // Clear all filters to defaults.
  const clearFilters = useCallback(() => {
    setDateFrom(startOfMonthISO());
    setDateTo(endOfMonthISO());
    setSelectedTeamIds([]);
    setSearch("");
    setRosterPage(1);
  }, []);

  // Whether any filter differs from its default (drives "Clear" button visibility).
  const hasActiveFilters =
    dateFrom !== startOfMonthISO() ||
    dateTo !== endOfMonthISO() ||
    selectedTeamIds.length > 0 ||
    search !== "";

  const emptyReason = getEmptyReason(
    dashboard.isError,
    hasAccess,
    hasTeams,
    dashboard.summary?.summary.standby_entry_count
  );

  if (meQuery.isLoading) return <DashboardLoadingState />;

  // no_access / no_teams: filters are irrelevant (admin action needed).
  // Show only the empty state without filters.
  if (emptyReason === "no_access" || emptyReason === "no_teams") {
    return <DashboardUnavailableState reason={emptyReason} />;
  }

  // no_data / error: filters stay visible so the user can change the date
  // range or retry. The empty state card renders below the filters.
  // Normal case: filters + view tabs + view content.
  return (
    <PageShell
      title="Control Room"
      subtitle={`Standby coverage · ${formatDateCompact(dateFrom)} – ${formatDateCompact(dateTo)}`}
      actions={
        dashboard.summaryUpdatedAt > 0 ? (
          <span className="text-xs text-muted-foreground">
            Last refreshed: {new Date(dashboard.summaryUpdatedAt).toLocaleTimeString()}
          </span>
        ) : undefined
      }
    >
      {/* Filters — always visible when user has access + teams */}
      <ControlRoomFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={wrapFilterChange(setDateFrom)}
        onDateToChange={wrapFilterChange(setDateTo)}
        coverage={coverage}
        selectedTeamIds={selectedTeamIds}
        onTeamIdsChange={wrapFilterChange(setSelectedTeamIds)}
        search={search}
        onSearchChange={wrapFilterChange(setSearch)}
        onRefresh={dashboard.refetch}
        isFetching={dashboard.isFetching}
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
        isWeekView={viewMode === "this-week"}
      />

      {/* Empty state for no_data / error — filters above let user retry */}
      <DashboardViewContent
        emptyReason={emptyReason}
        viewMode={viewMode}
        weekRoster={weekDashboard.roster}
        roster={dashboard.roster}
        coverage={coverage}
        onViewModeChange={setViewMode}
      />
    </PageShell>
  );
};

export default ControlRoomDashboardPage;
