import React, { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { buildFacets, toggleFacet, type FacetSelection } from "./calendarFacets";
import { typeFilters } from "./calendarSidebarUtils";
import type { User } from "@/types";

interface CalendarSidebarFacetsProps {
  users: User[];
  selection: FacetSelection;
  onChange: (selection: FacetSelection) => void;
  showStandby?: boolean;
  showVacation?: boolean;
  showSick?: boolean;
  onToggleType?: (type: "standby" | "vacation" | "sick") => void;
}

/**
 * Filter disclosure holding:
 * 1. Event Type legend toggles (Vacation, Sick, Standby)
 * 2. Client and tech chips that narrow the calendar to people working on them.
 * Collapsed by default unless filters are applied, saving vertical space for the roster.
 */
export const CalendarSidebarFacets: React.FC<CalendarSidebarFacetsProps> = ({
  users,
  selection,
  onChange,
  showStandby,
  showVacation,
  showSick,
  onToggleType,
}) => {
  const [open, setOpen] = useState(false);
  const { clients, techs } = buildFacets(users);
  const showClients = clients.length > 1;
  const showTechs = techs.length > 1;
  const hasTypeFilters = Boolean(onToggleType);

  if (!showClients && !showTechs && !hasTypeFilters) return null;

  const isTypeFilterActive = showStandby === false || showVacation === false || showSick === false;
  const activeCount =
    (selection.client ? 1 : 0) + (selection.tech ? 1 : 0) + (isTypeFilterActive ? 1 : 0);
  const expanded = open || activeCount > 0;

  const typeState = {
    vacation: showVacation ?? true,
    standby: showStandby ?? true,
    sick: showSick ?? true,
  };

  return (
    <div className="border-border/60 border-b px-2 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="calendar-sidebar-facets"
        className="text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-between gap-1.5 rounded-md px-1 py-1 text-[10px] font-bold tracking-wider uppercase transition"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Filters{activeCount > 0 ? ` (${activeCount})` : ""}</span>
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id="calendar-sidebar-facets" className="mt-1.5 flex flex-col gap-2">
          {hasTypeFilters && onToggleType && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-[9px] font-semibold tracking-wider uppercase">
                Legend / Event Types
              </span>
              <div className="flex flex-wrap gap-1">
                {typeFilters.map((filter) => {
                  const active = typeState[filter.key];
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => onToggleType(filter.key)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium transition",
                        active
                          ? "border-border bg-card text-foreground font-semibold shadow-2xs"
                          : "border-border/40 text-muted-foreground/60 opacity-40 hover:opacity-75"
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", filter.dot)} />
                      <span>{filter.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {showClients && (
            <FilterChipRow
              label="Client"
              options={clients}
              selected={selection.client ? [selection.client] : []}
              onToggle={(value) => onChange(toggleFacet(selection, "client", value))}
            />
          )}
          {showTechs && (
            <FilterChipRow
              label="Tech"
              options={techs}
              selected={selection.tech ? [selection.tech] : []}
              onToggle={(value) => onChange(toggleFacet(selection, "tech", value))}
            />
          )}
        </div>
      )}
    </div>
  );
};
