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
import { toggleChipSelection } from "@/components/ui/chipSelection";
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

const MULTI_HINT = "Click to filter by one; Ctrl+click to select multiple";

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
  const handleTechClick = (id: number, event: React.MouseEvent<HTMLButtonElement>) => {
    const multi = event.ctrlKey || event.metaKey;
    const nextTechIds = toggleChipSelection(selectedTechIds, id, multi);

    if (noTechOnly) {
      onNoTechOnlyChange(false);
    }

    // Keep only level chips that belong to techs remaining in the selection so
    // a stale level filter can never keep narrowing a deselected tech.
    const allowedLevelIds = new Set(
      facets
        .filter((facet) => nextTechIds.includes(facet.id))
        .flatMap((facet) => (facet.levels ?? []).map((level) => level.id))
    );
    const nextLevelIds = selectedLevelIds.filter((levelId) => allowedLevelIds.has(levelId));

    onTechIdsChange(nextTechIds);
    if (nextLevelIds.length !== selectedLevelIds.length) {
      onLevelIdsChange(nextLevelIds);
    }
  };

  const handleNoTechClick = () => {
    const next = !noTechOnly;
    if (next) {
      if (selectedTechIds.length > 0) onTechIdsChange([]);
      if (selectedLevelIds.length > 0) onLevelIdsChange([]);
    }
    onNoTechOnlyChange(next);
  };

  const handleLevelClick = (id: number, event: React.MouseEvent<HTMLButtonElement>) => {
    const multi = event.ctrlKey || event.metaKey;
    onLevelIdsChange(toggleChipSelection(selectedLevelIds, id, multi));
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
            onLevelIdsChange([]);
            onNoTechOnlyChange(false);
          }}
        >
          All tech
        </Chip>
        {facets.map((facet) => (
          <Chip
            key={facet.id}
            pressed={selectedTechIds.includes(facet.id)}
            title={MULTI_HINT}
            onClick={(event) => handleTechClick(facet.id, event)}
          >
            {facet.name}{" "}
            <span className="font-mono text-xs font-normal tabular-nums">{facet.count}</span>
          </Chip>
        ))}
        <Chip
          pressed={noTechOnly}
          onClick={handleNoTechClick}
          className={noTechOnly ? undefined : "border-dashed"}
        >
          No tech <span className="font-mono text-xs font-normal tabular-nums">{noTechCount}</span>
        </Chip>
      </FacetRow>
      {levelRows.map((facet) => (
        <FacetRow key={facet.id} label={`${facet.code} levels`}>
          {facet.levels.map((level) => (
            <Chip
              key={level.id}
              pressed={selectedLevelIds.includes(level.id)}
              onClick={(event) => handleLevelClick(level.id, event)}
              title={`${facet.name} — ${level.name}`}
            >
              {level.code}{" "}
              <span className="font-mono text-xs font-normal tabular-nums">{level.count}</span>
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
