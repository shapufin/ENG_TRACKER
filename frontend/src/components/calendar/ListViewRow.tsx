import React from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

interface ListViewRowProps {
  event: CalendarEvent;
  user: User | undefined;
  typeColors: Record<CalendarEvent["type"], string>;
  statusColors: Record<string, string>;
  onUserClick?: (userId: number) => void;
}

export const ListViewRow: React.FC<ListViewRowProps> = ({
  event,
  user,
  typeColors,
  statusColors,
  onUserClick,
}) => {
  const name = user?.full_name || event.userName || "Unknown User";

  return (
    <tr className="border-b border-border/50 transition-colors hover:bg-muted/40">
      {/* DATE */}
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-border/50 bg-muted/40 p-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {format(parseISO(event.start), "MMM d, yyyy")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {event.start === event.end
                ? "1 day"
                : `${format(parseISO(event.start), "MMM d")} → ${format(parseISO(event.end), "MMM d")}`}
            </p>
          </div>
        </div>
      </td>

      {/* USER */}
      <td className="px-5 py-4">
        <button
          type="button"
          onClick={() => event.userId && onUserClick?.(event.userId)}
          className="flex items-center gap-3 rounded-lg text-left transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <UserAvatar name={name} email={user?.email} colorSeed={event.userId} />
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{name}</p>
            <p className="text-[11px] text-muted-foreground">
              {user?.teams?.[0]?.name || "NO TEAM"}
            </p>
          </div>
        </button>
      </td>

      {/* TYPE */}
      <td className="px-5 py-4">
        <div
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium capitalize",
            typeColors[event.type]
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {event.type}
        </div>
      </td>

      {/* DETAILS */}
      <td className="px-5 py-4">
        <div className="space-y-1">
          <p className="text-sm text-foreground">{event.description || event.compactLabel}</p>
          {(event.hours || event.days) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {event.hours ? `${event.hours}h logged` : `${event.days} day(s)`}
            </div>
          )}
        </div>
      </td>

      {/* STATUS */}
      <td className="px-5 py-4">
        <div
          className={cn(
            "inline-flex rounded-full border px-3 py-1 text-xs font-medium capitalize",
            statusColors[event.status]
          )}
        >
          {event.status}
        </div>
      </td>
    </tr>
  );
};
