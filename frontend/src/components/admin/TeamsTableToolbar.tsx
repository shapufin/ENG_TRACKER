import React from "react";
import { Button } from "@/components/ui/button";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";

interface TeamsTableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TeamsTableToolbar: React.FC<TeamsTableToolbarProps> = ({
  searchQuery,
  onSearchChange,
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
      <Button variant="outline" size="control">
        Columns (6/6)
      </Button>
    </FilterToolbar.Group>
  </FilterToolbar>
);
