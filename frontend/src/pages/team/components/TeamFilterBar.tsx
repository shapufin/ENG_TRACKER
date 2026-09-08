import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/ui/GlassCard";
import { DatePicker } from "@/components/ui/DatePicker";
import { useAutoMonthEndHandlers } from "@/lib/useAutoMonthEnd";
import { Search, Filter, Users, Calendar } from "lucide-react";

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
  const { handleFromChange, handleToChange } = useAutoMonthEndHandlers(
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange
  );

  return (
    <GlassCard isHoverLift={false} className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[200px] flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="min-h-11 pl-10"
              placeholder="Search employee or description..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
            />
          </div>
        </div>
        <Select
          value={filterStatus}
          onValueChange={(v) =>
            onFilterStatusChange(v as "all" | "pending" | "approved" | "rejected")
          }
        >
          <SelectTrigger className="h-11 min-h-11 w-full px-3 sm:w-[140px]">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
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
            <SelectTrigger className="h-11 min-h-11 w-full px-3 sm:w-[160px]">
              <div className="flex items-center gap-2 text-left">
                <Users className="h-4 w-4 text-muted-foreground" />
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
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <DatePicker
            id="team-date-from"
            value={dateFrom}
            onChange={handleFromChange}
            placeholder="From"
          />
          <DatePicker id="team-date-to" value={dateTo} onChange={handleToChange} placeholder="To" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Grouping mode</p>
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
