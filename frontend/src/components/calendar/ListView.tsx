import React, { useMemo, useState } from "react";
import { parseISO, compareAsc } from "date-fns";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";
import { ListViewHeader } from "./ListViewHeader";
import { ListViewRow } from "./ListViewRow";
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
        <table className="w-full min-w-0 border-collapse md:min-w-[720px]">
          <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur-xl">
            <tr className="border-b border-border/70">
              {HEADERS.map((header) => (
                <th
                  key={header}
                  className="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
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

        {filteredEvents.length === 0 && <ListViewEmptyState />}
      </div>
    </div>
  );
};
