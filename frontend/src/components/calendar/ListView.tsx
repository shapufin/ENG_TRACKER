import React, { useMemo, useState } from "react";
import { parseISO, compareAsc } from "date-fns";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";
import { ListViewHeader } from "./ListViewHeader";
import { ListViewRow } from "./ListViewRow";
import { ListViewAgenda } from "./ListViewAgenda";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { MOBILE_CARD_QUERY } from "@/components/ui/DataTableCards";
import { ListViewEmptyState } from "./ListViewEmptyState";
import {
  calendarEventStatusStyles,
  calendarEventTypeStyles,
  calendarSurface,
} from "./calendarStyles";

interface ListViewProps {
  events: CalendarEvent[];
  users: User[];
  onUserClick?: (userId: number) => void;
}

const typeColors: Record<CalendarEvent["type"], string> = Object.fromEntries(
  Object.entries(calendarEventTypeStyles).map(([type, styles]) => [
    type,
    `${styles.surface} ${styles.title}`,
  ])
) as Record<CalendarEvent["type"], string>;

const statusColors: Record<CalendarEvent["status"], string> = Object.fromEntries(
  Object.entries(calendarEventStatusStyles).map(([status, styles]) => [
    status,
    `${styles.surface} ${styles.title}`,
  ])
) as Record<CalendarEvent["status"], string>;

const HEADERS = ["Date", "User", "Type", "Details", "Status"];

export const ListView: React.FC<ListViewProps> = ({ events, users, onUserClick }) => {
  const [query, setQuery] = useState("");
  const isPhone = useMediaQuery(MOBILE_CARD_QUERY);

  const userLookup = useMemo(() => {
    return users.reduce<Record<number, User>>((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const filteredEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => compareAsc(parseISO(a.start), parseISO(b.start)));
    if (!query.trim()) return sorted;

    const q = query.toLowerCase();
    return sorted.filter((event) => {
      const user = userLookup[event.userId || 0];
      return [event.title, event.description, event.userName, event.type, user?.email]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(q));
    });
  }, [events, query, userLookup]);

  return (
    <div className={`flex h-full flex-col overflow-hidden ${calendarSurface}`}>
      <ListViewHeader query={query} onQueryChange={setQuery} />

      <div className="min-h-0 flex-1 overflow-auto">
        {isPhone ? (
          <ListViewAgenda
            events={filteredEvents}
            userLookup={userLookup}
            typeColors={typeColors}
            statusColors={statusColors}
            onUserClick={onUserClick}
          />
        ) : (
          <table
            className="w-full min-w-0 border-collapse md:min-w-[720px]" // ds-allow-hardcode: tablet+ keeps its 720px minimum
          >
            <thead className="bg-card/95 sticky top-0 z-20 backdrop-blur-xl">
              <tr className="border-border/70 border-b">
                {HEADERS.map((header) => (
                  <th
                    key={header}
                    className="text-muted-foreground px-5 py-4 text-left text-xs font-semibold tracking-[0.2em] uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredEvents.map((event) => (
                <ListViewRow
                  key={event.id}
                  event={event}
                  user={userLookup[event.userId || 0]}
                  typeColors={typeColors}
                  statusColors={statusColors}
                  onUserClick={onUserClick}
                />
              ))}
            </tbody>
          </table>
        )}

        {filteredEvents.length === 0 && <ListViewEmptyState />}
      </div>
    </div>
  );
};
