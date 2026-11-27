import React from "react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { SearchField } from "@/components/ui/SearchField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Filter, Users, Calendar, RotateCcw } from "lucide-react";

export type TeamGroupingMode = "range" | "none" | "team" | "italian_tl";

interface TeamFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  filterStatus: "all" | "pending" | "approved" | "rejected";
  onFilterStatusChange: (v: "all" | "pending" | "approved" | "rejected") => void;
  filterTeam: string;
  onFilterTeamChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  memberGroupMode: TeamGroupingMode;
  onMemberGroupModeChange: (v: TeamGroupingMode) => void;
  availableTeams: { id: number; name: string }[];
  rangeGroupLabel?: string;
  statusCounts?: { all: number; pending: number; approved: number; rejected: number };
  tier1Left?: React.ReactNode;
  resultCount?: number;
  onResetFilters?: () => void;
}

export const TeamFilterBar: React.FC<TeamFilterBarProps> = ({
  searchQuery,
  onSearchQueryChange,
  filterStatus,
  onFilterStatusChange,
  filterTeam,
  onFilterTeamChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  memberGroupMode,
  onMemberGroupModeChange,
  availableTeams,
  rangeGroupLabel,
  statusCounts,
  tier1Left,
  resultCount,
  onResetFilters,
}) => {
  const groupOptions: { label: string; value: TeamGroupingMode }[] = [
    ...(rangeGroupLabel ? [{ label: rangeGroupLabel, value: "range" as const }] : []),
    { label: rangeGroupLabel ? "List" : "Ungrouped", value: "none" },
    { label: "By Team", value: "team" },
    { label: "By Manager", value: "italian_tl" },
  ];

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterStatus !== "all" ||
    filterTeam !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <GlassCard className="space-y-4 p-4">
      <div className="border-line-subtle flex flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
        {tier1Left && <div className="min-w-0 flex-1">{tier1Left}</div>}
        <FilterChipRow<TeamGroupingMode>
          label="Grouping"
          options={groupOptions}
          selected={[memberGroupMode]}
          onToggle={onMemberGroupModeChange}
        />
      </div>

      <FilterToolbar className="gap-4">
        <FilterToolbar.Search>
          <SearchField
            controlSize="lg"
            placeholder="Search employee or description..."
            aria-label="Search employee or description"
            value={searchQuery}
            onChange={onSearchQueryChange}
          />
        </FilterToolbar.Search>
        <Select
          value={filterStatus}
          onValueChange={(v) =>
            onFilterStatusChange(v as "all" | "pending" | "approved" | "rejected")
          }
        >
          <SelectTrigger controlSize="lg" className="w-full px-3 sm:w-[155px]">
            <div className="flex items-center gap-2">
              <Filter className="text-muted-foreground h-4 w-4" />
              <SelectValue placeholder="Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              All Status{statusCounts ? ` (${statusCounts.all})` : ""}
            </SelectItem>
            <SelectItem value="pending">
              Pending{statusCounts ? ` (${statusCounts.pending})` : ""}
            </SelectItem>
            <SelectItem value="approved">
              Approved{statusCounts ? ` (${statusCounts.approved})` : ""}
            </SelectItem>
            <SelectItem value="rejected">
              Rejected{statusCounts ? ` (${statusCounts.rejected})` : ""}
            </SelectItem>
          </SelectContent>
        </Select>
        {availableTeams.length > 0 && (
          <Select value={filterTeam} onValueChange={onFilterTeamChange}>
            <SelectTrigger controlSize="lg" className="w-full px-3 sm:w-[160px]">
              <div className="flex items-center gap-2 text-left">
                <Users className="text-muted-foreground h-4 w-4" />
                <SelectValue placeholder="All Teams" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {availableTeams.map((team) => (
                <SelectItem key={team.id} value={team.id.toString()}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="text-muted-foreground h-4 w-4" />
          <DateRangePicker
            id="team-date-range"
            from={dateFrom}
            to={dateTo}
            onChange={({ from, to }) => {
              onDateFromChange(from);
              onDateToChange(to);
            }}
            placeholder="Filter by date"
            className="w-full min-w-[220px] sm:w-auto"
          />
        </div>
      </FilterToolbar>

      {hasActiveFilters && onResetFilters && (
        <div className="border-line-subtle flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs">
          <span className="text-muted-foreground tabular-nums">
            Showing {resultCount ?? 0} matching {resultCount === 1 ? "record" : "records"}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onResetFilters}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset filters
          </Button>
        </div>
      )}
    </GlassCard>
  );
};
