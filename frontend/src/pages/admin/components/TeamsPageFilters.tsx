import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type { TeamLeaderFilter } from "../hooks/useTeamsPageUI";

interface TeamsPageFiltersProps {
  leaderFilter: TeamLeaderFilter;
  onLeaderFilterChange: (value: TeamLeaderFilter) => void;
  groups: string[];
  groupFilter: string;
  onGroupFilterChange: (value: string) => void;
  counts: { all: number; withLeader: number; noLeader: number };
}

/**
 * Leader / calendar-group facet chips. Rendered as the header strip of the
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
}) => {
  return (
    <div className="border-line-subtle space-y-2 border-b pb-4">
      <FilterChipRow<TeamLeaderFilter>
        label="Leader"
        options={[
          { value: "all", label: "All teams", count: counts.all },
          { value: "with-leader", label: "With leader", count: counts.withLeader },
          { value: "no-leader", label: "No leader", count: counts.noLeader, emphasis: "missing" },
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
    </div>
  );
};
