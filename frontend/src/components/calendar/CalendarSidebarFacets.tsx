import React from "react";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { buildFacets, toggleFacet, type FacetSelection } from "./calendarFacets";
import type { User } from "@/types";

interface CalendarSidebarFacetsProps {
  users: User[];
  selection: FacetSelection;
  onChange: (selection: FacetSelection) => void;
}

/** Client and tech chips that narrow the calendar to the people working on them. A row with
 * fewer than two choices narrows nothing, so it is not drawn. */
export const CalendarSidebarFacets: React.FC<CalendarSidebarFacetsProps> = ({
  users,
  selection,
  onChange,
}) => {
  const { clients, techs } = buildFacets(users);
  const showClients = clients.length > 1;
  const showTechs = techs.length > 1;
  if (!showClients && !showTechs) return null;

  return (
    <div className="border-border/60 flex flex-col gap-2 border-b p-3">
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
  );
};
