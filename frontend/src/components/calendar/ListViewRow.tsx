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
    <tr className="border-border/50 hover:bg-table-hover border-b transition-colors">
      {/* DATE */}
      <td className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="border-border/50 bg-muted/40 rounded-lg border p-2">
            <Calendar className="text-muted-foreground h-4 w-4" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">
              {format(parseISO(event.start), "MMM d, yyyy")}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
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
          className="focus-visible:ring-ring/60 flex items-center gap-3 rounded-lg text-left transition hover:opacity-80 focus-visible:ring-2 focus-visible:outline-hidden"
        >
          <UserAvatar name={name} email={user?.email} colorSeed={event.userId} />
          <div className="text-left">
            <p className="text-foreground text-sm font-medium">{name}</p>
            <p className="text-muted-foreground text-xs">{user?.teams?.[0]?.name || "NO TEAM"}</p>
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
          <p className="text-foreground text-sm">{event.description || event.compactLabel}</p>
          {(event.hours || event.days) && (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
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
