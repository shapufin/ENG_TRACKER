import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

interface ListViewAgendaProps {
  events: CalendarEvent[];
  userLookup: Record<number, User>;
  typeColors: Record<CalendarEvent["type"], string>;
  statusColors: Record<string, string>;
  onUserClick?: (userId: number) => void;
}

const spanLabel = (event: CalendarEvent) => {
  if (event.isHalfDay) {
    return `Half day (${event.halfDayPeriod === "afternoon" ? "afternoon" : "morning"})`;
  }
  if (event.start === event.end) return null;
  return `${format(parseISO(event.start), "MMM d")} → ${format(parseISO(event.end), "MMM d")}`;
};

/** Phone layout of the calendar list: one heading per day, one card per event. */
export const ListViewAgenda: React.FC<ListViewAgendaProps> = ({
  events,
  userLookup,
  typeColors,
  statusColors,
  onUserClick,
}) => {
  const days = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.start.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return [...groups.entries()];
  }, [events]);

  return (
    <div className="space-y-4 p-3">
      {days.map(([day, dayEvents]) => (
        <section key={day}>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {format(parseISO(day), "EEE, MMM d")}
          </h3>
          <ul className="divide-border/50 border-border/50 bg-card divide-y rounded-xl border">
            {dayEvents.map((event) => {
              const user = userLookup[event.userId || 0];
              const name = user?.full_name || event.userName || "Unknown User";
              const span = spanLabel(event);
              return (
                <li key={event.id} className="flex flex-col gap-2 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => event.userId && onUserClick?.(event.userId)}
                      className="focus-visible:ring-ring/60 flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-left focus-visible:ring-2 focus-visible:outline-hidden"
                    >
                      <UserAvatar name={name} email={user?.email} colorSeed={event.userId} />
                      <span className="text-foreground truncate text-sm font-medium">{name}</span>
                    </button>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                        statusColors[event.status]
                      )}
                    >
                      {event.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 font-medium capitalize",
                        typeColors[event.type]
                      )}
                    >
                      {event.type}
                    </span>
                    {span && <span className="text-muted-foreground">{span}</span>}
                    {(event.hours || event.days) && (
                      <span className="text-muted-foreground">
                        {event.hours ? `${event.hours}h logged` : `${event.days} day(s)`}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-foreground text-sm">{event.description}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
