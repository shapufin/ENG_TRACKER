import React from "react";
import { ColumnToggleMenu } from "@/components/ui/ColumnToggleMenu";
import { Chip } from "@/components/ui/Chip";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { TEAMS_COLUMNS } from "./teamsColumns";
import type { TeamStatusFilter } from "./TeamsTable";

interface TeamsTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: TeamStatusFilter;
  onStatusFilterChange?: (status: TeamStatusFilter) => void;
  statusCounts: Record<TeamStatusFilter, number>;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (visibility: Record<string, boolean>) => void;
}

const STATUS_OPTIONS: { value: TeamStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "grouped", label: "Grouped" },
  { value: "ungrouped", label: "Ungrouped" },
];

export const TeamsTableToolbar: React.FC<TeamsTableToolbarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  columnVisibility,
  onColumnVisibilityChange,
}) => (
  <FilterToolbar className="border-border/50 border-b p-5">
    <FilterToolbar.Search>
      <SearchField
        placeholder="Search teams..."
        aria-label="Search teams"
        value={searchQuery}
        onChange={onSearchChange}
      />
    </FilterToolbar.Search>
    <FilterToolbar.Group className="flex-wrap">
      {STATUS_OPTIONS.map((option) => (
        <Chip
          key={option.value}
          pressed={statusFilter === option.value}
          onClick={() => onStatusFilterChange?.(option.value)}
        >
          {option.label}{" "}
          <span className="font-mono text-xs font-normal tabular-nums">
            {statusCounts[option.value]}
          </span>
        </Chip>
      ))}
      <ColumnToggleMenu
        columns={TEAMS_COLUMNS}
        visibility={columnVisibility}
        onVisibilityChange={onColumnVisibilityChange}
      />
    </FilterToolbar.Group>
  </FilterToolbar>
);
