import React from "react";
import { Button } from "@/components/ui/button";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
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
import { Filter, Users, Calendar } from "lucide-react";

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
  memberGroupMode: "none" | "team" | "italian_tl";
  onMemberGroupModeChange: (v: "none" | "team" | "italian_tl") => void;
  availableTeams: { id: number; name: string }[];
}

const groupOptions: { label: string; value: "none" | "team" | "italian_tl" }[] = [
  { label: "Ungrouped", value: "none" },
  { label: "By Team", value: "team" },
  { label: "By Italian TL", value: "italian_tl" },
];

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
}) => {
  return (
    <GlassCard className="space-y-4 p-4">
      <FilterToolbar className="gap-4">
        <FilterToolbar.Search>
          <SearchField
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
          <SelectTrigger className="w-full px-3 sm:w-[140px]">
            <div className="flex items-center gap-2">
              <Filter className="text-muted-foreground h-4 w-4" />
              <SelectValue placeholder="Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        {availableTeams.length > 0 && (
          <Select value={filterTeam} onValueChange={onFilterTeamChange}>
            <SelectTrigger className="w-full px-3 sm:w-[160px]">
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
            className="w-auto min-w-[220px]"
          />
        </div>
      </FilterToolbar>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">Grouping mode</p>
        <div className="flex flex-wrap gap-2">
          {groupOptions.map((option) => (
            <Button
              key={option.value}
              size="sm"
              className="min-h-11"
              variant={memberGroupMode === option.value ? "default" : "outline"}
              onClick={() => onMemberGroupModeChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </GlassCard>
  );
};
