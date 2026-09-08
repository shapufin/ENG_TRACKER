/**
 * ControlRoomFilters — date range, multi-team selector, search.
 *
 * Simplified per user feedback: removed status mode dropdown and
 * include-rejected switch. CR dashboard now always shows approved-only
 * shifts (hardcoded in the hook). CR users don't need to see pending/
 * rejected status — the dashboard is a clean read-only view of who is
 * on standby.
 *
 * Team filter is multi-select (checkboxes in a popover). A "Clear
 * filters" button resets date range, team selection, and search to
 * their defaults.
 */
import React, { useMemo } from "react";
import { Search, RefreshCw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/DatePicker";
import { GlassCard } from "@/components/ui/GlassCard";
import { TeamMultiSelect } from "./TeamMultiSelect";
import type { ControlRoomCoverage } from "../types";

interface Props {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  coverage: ControlRoomCoverage[];
  selectedTeamIds: number[];
  onTeamIdsChange: (ids: number[]) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  isFetching: boolean;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  /** When true (This Week tab), the date range pickers are hidden — the
   *  week view uses its own fixed current-week range. */
  isWeekView?: boolean;
}

export const ControlRoomFilters: React.FC<Props> = ({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  coverage,
  selectedTeamIds,
  onTeamIdsChange,
  search,
  onSearchChange,
  onRefresh,
  isFetching,
  onClearFilters,
  hasActiveFilters,
  isWeekView = false,
}) => {
  // Memoized to avoid rebuilding the options array on every render.
  const teamOptions = useMemo(
    () => coverage.map((c) => ({ id: c.team_id, name: c.team_name, code: c.team_code })),
    [coverage]
  );

  return (
    <GlassCard isHoverLift={false} className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-4">
        {isWeekView ? (
          <p className="text-xs text-muted-foreground">Showing current week (Mon–Sun)</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <DatePicker value={dateFrom} onChange={onDateFromChange} className="w-[140px]" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <DatePicker value={dateTo} onChange={onDateToChange} className="w-[140px]" />
            </div>
          </>
        )}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Teams</Label>
          <div className="w-[220px]">
            <TeamMultiSelect
              teams={teamOptions}
              value={selectedTeamIds}
              onChange={onTeamIdsChange}
              placeholder="All Teams"
            />
          </div>
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search people..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-48 pl-8"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onRefresh} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </GlassCard>
  );
};
