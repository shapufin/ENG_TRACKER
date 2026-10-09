/**
 * TechFacetFilter — inline multi-select tech chips with live counts for the
 * Admin Users page. Combinable with UserFilterTabs (role); counts come from
 * userService.getTechFacets, scoped server-side by the active role tab.
 *
 * Deliberately not a popover (unlike TeamMultiSelect) — the mockup shows an
 * always-visible chip row, and tech lists are short enough to render flat.
 */
import React from "react";
import { Chip } from "@/components/ui/Chip";
import { FacetRow } from "./FacetRow";
import type { TechFacet } from "@/types";

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

  const isAllActive = selectedTechIds.length === 0 && !noTechOnly;

  if (facets.length === 0 && noTechCount === 0) return null;

  return (
    <div className="space-y-2">
      <FacetRow label="Tech">
        <Chip
          pressed={isAllActive}
          onClick={() => {
            onTechIdsChange([]);
            onNoTechOnlyChange(false);
          }}
        >
          All tech
        </Chip>
        {facets.map((facet) => (
          <Chip
            key={facet.id}
            pressed={selectedTechIds.includes(facet.id)}
            onClick={() => toggleTech(facet.id)}
          >
            {facet.name}{" "}
            <span className="font-mono text-xs tabular-nums opacity-70">{facet.count}</span>
          </Chip>
        ))}
        <Chip
          pressed={noTechOnly}
          onClick={() => onNoTechOnlyChange(!noTechOnly)}
          className={noTechOnly ? undefined : "border-dashed"}
        >
          No tech <span className="font-mono text-xs tabular-nums opacity-70">{noTechCount}</span>
        </Chip>
      </FacetRow>
      {levelRows.map((facet) => (
        <FacetRow key={facet.id} label={`${facet.code} levels`}>
          {facet.levels.map((level) => (
            <Chip
              key={level.id}
              pressed={selectedLevelIds.includes(level.id)}
              onClick={() => toggleLevel(level.id)}
              title={`${facet.name} � ${level.name}`}
            >
              {level.code}{" "}
              <span className="font-mono text-xs tabular-nums opacity-70">{level.count}</span>
            </Chip>
          ))}
          {facet.no_level_count > 0 && (
            <span className="text-muted-foreground text-xs">{facet.no_level_count} ungraded</span>
          )}
        </FacetRow>
      ))}
    </div>
  );
};
