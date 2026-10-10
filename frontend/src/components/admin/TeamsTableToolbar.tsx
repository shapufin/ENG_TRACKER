import React from "react";
import { ColumnToggleMenu } from "@/components/ui/ColumnToggleMenu";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";
import { TEAMS_COLUMNS } from "./teamsColumns";

interface TeamsTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (visibility: Record<string, boolean>) => void;
}

export const TeamsTableToolbar: React.FC<TeamsTableToolbarProps> = ({
  searchQuery,
  onSearchChange,
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
    <FilterToolbar.Group>
      <ColumnToggleMenu
        columns={TEAMS_COLUMNS}
        visibility={columnVisibility}
        onVisibilityChange={onColumnVisibilityChange}
      />
    </FilterToolbar.Group>
  </FilterToolbar>
);
