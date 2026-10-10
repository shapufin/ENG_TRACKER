/**
 * TechFacetFilter — inline multi-select tech chips with live counts for the
 * Admin Users page. Combinable with UserFilterTabs (role); counts come from
 * userService.getTechFacets, scoped server-side by the active role tab.
 *
 * Deliberately not a popover (unlike TeamMultiSelect) — the mockup shows an
 * always-visible chip row, and tech lists are short enough to render flat.
 */
import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type { TechFacet } from "@/types";

const ALL = "all";
const NONE = "none";

interface TechFacetFilterProps {
  facets: TechFacet[];
  noTechCount: number;
  selectedTechIds: number[];
  selectedLevelIds: number[];
  noTechOnly: boolean;
  onTechIdsChange: (ids: number[]) => void;
  onLevelIdsChange: (ids: number[]) => void;
  onNoTechOnlyChange: (value: boolean) => void;
}

export const TechFacetFilter: React.FC<TechFacetFilterProps> = ({
  facets,
  noTechCount,
  selectedTechIds,
  selectedLevelIds,
  noTechOnly,
  onTechIdsChange,
  onLevelIdsChange,
  onNoTechOnlyChange,
}) => {
  const toggleTech = (id: number) => {
    if (selectedTechIds.includes(id)) {
      // Deselecting a tech drops its level chips too, so a stale level filter
      // can never keep narrowing a tech that is no longer selected.
      const dropped = new Set(
        (facets.find((facet) => facet.id === id)?.levels ?? []).map((level) => level.id)
      );
      onTechIdsChange(selectedTechIds.filter((v) => v !== id));
      onLevelIdsChange(selectedLevelIds.filter((levelId) => !dropped.has(levelId)));
    } else {
      onTechIdsChange([...selectedTechIds, id]);
    }
  };

  const toggleLevel = (id: number) => {
    onLevelIdsChange(
      selectedLevelIds.includes(id)
        ? selectedLevelIds.filter((v) => v !== id)
        : [...selectedLevelIds, id]
    );
  };

  // Level chips only appear for the techs currently selected — showing every
  // scale at once would be an unreadable wall of chips.
  const levelRows = facets.filter(
    (facet) => selectedTechIds.includes(facet.id) && (facet.levels?.length ?? 0) > 0
  );

  const selected: string[] = [
    ...(selectedTechIds.length === 0 && !noTechOnly ? [ALL] : []),
    ...selectedTechIds.map(String),
    ...(noTechOnly ? [NONE] : []),
  ];

  const onToggle = (value: string) => {
    if (value === ALL) {
      onTechIdsChange([]);
      onNoTechOnlyChange(false);
    } else if (value === NONE) {
      onNoTechOnlyChange(!noTechOnly);
    } else {
      toggleTech(Number(value));
    }
  };

  if (facets.length === 0 && noTechCount === 0) return null;

  return (
    <div className="border-border/70 space-y-2 border-t pt-2">
      <FilterChipRow
        label="Tech"
        options={[
          { value: ALL, label: "All tech" },
          ...facets.map((facet) => ({
            value: String(facet.id),
            label: facet.name,
            count: facet.count,
          })),
          { value: NONE, label: "No tech", count: noTechCount, emphasis: "missing" as const },
        ]}
        selected={selected}
        onToggle={onToggle}
      />
      {levelRows.map((facet) => (
        <div key={facet.id} className="space-y-1">
          <FilterChipRow
            label={`${facet.code} level`}
            options={facet.levels.map((level) => ({
              value: String(level.id),
              label: level.code,
              count: level.count,
            }))}
            selected={selectedLevelIds.map(String)}
            onToggle={(value) => toggleLevel(Number(value))}
          />
          {facet.no_level_count > 0 && (
            <span className="text-muted-foreground block text-xs sm:pl-20">
              {facet.no_level_count} ungraded
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
