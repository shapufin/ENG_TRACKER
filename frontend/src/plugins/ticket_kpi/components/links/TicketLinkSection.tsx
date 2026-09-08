import React from "react";
import { Link2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTicketLink } from "../../pages/hooks/useTicketLink";

interface TicketLinkSectionProps {
  overtimeLogId: number;
}

export const TicketLinkSection: React.FC<TicketLinkSectionProps> = ({ overtimeLogId }) => {
  const {
    query,
    setQuery,
    links,
    searchResults,
    isLoading,
    isSearching,
    createLink,
    deleteLink,
    isCreating,
    isDeleting,
  } = useTicketLink(overtimeLogId);

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Linked KPI tickets</h3>
      </div>
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ticket reference"
          aria-label="Search KPI tickets"
        />
        {isSearching && <p className="text-xs text-muted-foreground">Searching...</p>}
        {searchResults.length > 0 && (
          <div className="space-y-1" role="listbox" aria-label="KPI ticket results">
            {searchResults.map((ticket) => (
              <Button
                key={ticket.id}
                type="button"
                variant="outline"
                className="h-auto w-full justify-start text-left"
                disabled={isCreating}
                onClick={() => createLink(ticket.id)}
              >
                <span>
                  <strong>{ticket.ticket_id}</strong>
                  <span className="ml-2 text-muted-foreground">{ticket.title}</span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-label="Loading linked tickets" />
      ) : links.length > 0 ? (
        <ul className="space-y-1" aria-label="Linked KPI tickets">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <strong>{link.ticket_id}</strong>
                <span className="ml-2 text-muted-foreground">{link.ticket_title}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove link ${link.ticket_id}`}
                disabled={isDeleting}
                onClick={() => deleteLink(link.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No KPI tickets linked yet.</p>
      )}
    </section>
  );
};
