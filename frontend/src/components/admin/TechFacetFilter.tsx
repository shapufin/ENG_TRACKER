/**
 * TechFacetFilter — inline multi-select tech chips with live counts for the
 * Admin Users page. Combinable with UserFilterTabs (role); counts come from
 * userService.getTechFacets, scoped server-side by the active role tab.
 *
 * Deliberately not a popover (unlike TeamMultiSelect) — the mockup shows an
 * always-visible chip row, and tech lists are short enough to render flat.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass } from "@/components/ui/tone";
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
    <div className="space-y-2 border-t border-border/70 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Tech filter
        </span>
        <button
          type="button"
          onClick={() => {
            onTechIdsChange([]);
            onNoTechOnlyChange(false);
          }}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
            isAllActive
              ? // Accent token, not text-primary: #7c3bed on the dark chip
                // surface measures 3.32:1 — below AA for 11px text.
                toneSurfaceClass.accent
              : "border-border bg-background text-muted-foreground hover:border-primary/30"
          )}
        >
          All tech
        </button>
        {facets.map((facet) => {
          const isActive = selectedTechIds.includes(facet.id);
          return (
            <button
              key={facet.id}
              type="button"
              onClick={() => toggleTech(facet.id)}
              aria-pressed={isActive}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                isActive
                  ? toneSurfaceClass.info
                  : "border-border bg-background text-foreground/80 hover:border-primary/30"
              )}
            >
              {facet.name}{" "}
              <span className="ml-1 font-mono text-muted-foreground">{facet.count}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onNoTechOnlyChange(!noTechOnly)}
          aria-pressed={noTechOnly}
          className={cn(
            "rounded-lg border border-dashed px-3 py-1.5 text-[11px] font-semibold transition-colors",
            noTechOnly
              ? toneSurfaceClass.accent
              : "border-border text-muted-foreground hover:border-primary/30"
          )}
        >
          No tech <span className="ml-1 font-mono">{noTechCount}</span>
        </button>
      </div>
      {levelRows.map((facet) => (
        <div key={facet.id} className="flex flex-wrap items-center gap-2 pl-1">
          <span className="mr-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {facet.code} level
          </span>
          {facet.levels.map((level) => {
            const isActive = selectedLevelIds.includes(level.id);
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => toggleLevel(level.id)}
                aria-pressed={isActive}
                title={`${facet.name} — ${level.name}`}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  isActive
                    ? toneSurfaceClass.info
                    : "border-border bg-background text-foreground/80 hover:border-primary/30"
                )}
              >
                {level.code}{" "}
                <span className="ml-0.5 font-mono text-muted-foreground">{level.count}</span>
              </button>
            );
          })}
          {facet.no_level_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {facet.no_level_count} ungraded
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
