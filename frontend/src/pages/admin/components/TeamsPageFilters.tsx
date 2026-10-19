import React from "react";
import { Button } from "@/components/ui/button";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type { TeamLeaderFilter } from "../hooks/useTeamsPageUI";

interface TeamsPageFiltersProps {
  leaderFilter: TeamLeaderFilter;
  onLeaderFilterChange: (value: TeamLeaderFilter) => void;
  groups: string[];
  groupFilter: string;
  onGroupFilterChange: (value: string) => void;
  counts: { all: number; complete: number; missingIt: number; missingAl: number };
  hasActiveFilters: boolean;
  onReset: () => void;
}

/**
 * IT/AL TL and calendar-group facet chips. Rendered as the header strip of the
 * teams table card (page and card are the only two surface levels), never as
 * a card of its own.
 */
export const TeamsPageFilters: React.FC<TeamsPageFiltersProps> = ({
  leaderFilter,
  onLeaderFilterChange,
  groups,
  groupFilter,
  onGroupFilterChange,
  counts,
  hasActiveFilters,
  onReset,
}) => {
  return (
    <div className="border-line-subtle space-y-2 border-b pb-4">
      <FilterChipRow<TeamLeaderFilter>
        label="Team leaders"
        options={[
          { value: "all", label: "All teams", count: counts.all },
          { value: "complete", label: "Both TLs", count: counts.complete },
          { value: "missing-it", label: "Missing IT TL", count: counts.missingIt, emphasis: "missing" },
          { value: "missing-al", label: "Missing AL TL", count: counts.missingAl, emphasis: "missing" },
        ]}
        selected={[leaderFilter]}
        onToggle={onLeaderFilterChange}
      />
      {groups.length > 0 && (
        <FilterChipRow<string>
          label="Calendar group"
          options={[
            { value: "all", label: "All groups" },
            ...groups.map((g) => ({ value: g, label: g })),
          ]}
          selected={[groupFilter]}
          onToggle={onGroupFilterChange}
        />
      )}
      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="control-sm" onClick={onReset}>
          Clear all
        </Button>
      )}
    </div>
  );
};
