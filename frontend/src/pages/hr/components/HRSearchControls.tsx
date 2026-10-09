import React from "react";
import { FilterToolbar } from "@/components/ui/FilterToolbar";
import { SearchField } from "@/components/ui/SearchField";

interface HRSearchControlsProps {
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
}

export const HRSearchControls: React.FC<HRSearchControlsProps> = ({
  searchQuery,
  onSearchQueryChange,
}) => (
  <FilterToolbar>
    <FilterToolbar.Search>
      <SearchField
        placeholder="Search personnel..."
        aria-label="Search personnel"
        value={searchQuery}
        onChange={onSearchQueryChange}
      />
    </FilterToolbar.Search>
  </FilterToolbar>
);
