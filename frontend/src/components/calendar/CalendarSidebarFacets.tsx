import React, { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { buildFacets, toggleFacet, type FacetSelection } from "./calendarFacets";
import type { User } from "@/types";

interface CalendarSidebarFacetsProps {
  users: User[];
  selection: FacetSelection;
  onChange: (selection: FacetSelection) => void;
}

/**
 * Client and tech chips that narrow the calendar to the people working on them.
 * A row with fewer than two choices narrows nothing, so it is not drawn at all.
 * Collapsed by default (an applied filter keeps it open) to leave the roster the
 * vertical space.
 */
export const CalendarSidebarFacets: React.FC<CalendarSidebarFacetsProps> = ({
  users,
  selection,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const { clients, techs } = buildFacets(users);
  const showClients = clients.length > 1;
  const showTechs = techs.length > 1;
  if (!showClients && !showTechs) return null;

  const activeCount = (selection.client ? 1 : 0) + (selection.tech ? 1 : 0);
  const expanded = open || activeCount > 0;

  return (
    <div className="border-border/60 border-b px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="calendar-sidebar-facets"
        className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-xs font-semibold tracking-wide uppercase transition"
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
        <div id="calendar-sidebar-facets" className="mt-1 flex flex-col gap-1.5">
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
