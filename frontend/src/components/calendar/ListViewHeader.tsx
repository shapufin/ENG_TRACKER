import React from "react";
import { SearchField } from "@/components/ui/SearchField";

interface ListViewHeaderProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export const ListViewHeader: React.FC<ListViewHeaderProps> = ({ query, onQueryChange }) => (
  <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-5">
    <div>
      <h2 className="text-foreground text-lg font-semibold">Schedule List</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        All vacation, sick, standby and holiday entries
      </p>
    </div>

    <SearchField
      className="sm:w-[260px]"
      value={query}
      onChange={onQueryChange}
      placeholder="Search events..."
      aria-label="Search calendar events"
    />
  </div>
);
