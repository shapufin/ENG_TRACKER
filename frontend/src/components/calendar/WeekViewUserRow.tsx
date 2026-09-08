import React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./UserAvatar";
import { EventTooltip } from "./EventTooltip";
import { userDisplayName, eventColors, parseISOToLocal } from "./weekViewUtils";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

interface WeekViewUserRowProps {
  user: User;
  days: Date[];
  groupedEvents: Record<string, CalendarEvent[]>;
  onUserClick?: (userId: number) => void;
  onSelectDate?: (date: Date) => void;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  onRangeDragStart?: (date: Date) => void;
  onRangeDragEnter?: (date: Date) => void;
  onRangeDragEnd?: (date: Date) => void;
  isRangeSelecting?: boolean;
}

export const WeekViewUserRow: React.FC<WeekViewUserRowProps> = ({
  user,
  days,
  groupedEvents,
  onUserClick,
  onSelectDate,
  rangeStart,
  rangeEnd,
  onRangeDragStart,
  onRangeDragEnter,
  onRangeDragEnd,
  isRangeSelecting,
}) => {
  const userName = userDisplayName(user);
  return (
    <div className="grid grid-cols-[240px_repeat(7,minmax(0,1fr))] border-b border-border/50">
      <button
        type="button"
        onClick={() => onUserClick?.(user.id)}
        className="flex items-center gap-3 border-r border-border/60 px-4 py-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        <UserAvatar name={userName} email={user.email} colorSeed={user.id} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground" title={userName}>
            {userName}
          </p>
          <p
            className="truncate text-[11px] text-muted-foreground"
            title={user.teams?.[0]?.name || "NO TEAM"}
          >
            {user.teams?.[0]?.name || "NO TEAM"}
          </p>
        </div>
      </button>

      {days.map((day) => {
        const dayKey = format(day, "yyyy-MM-dd");
        const key = `${user.id}-${dayKey}`;
        const dayEvents = groupedEvents[key] || [];
        const rangeStartKey = rangeStart ? format(rangeStart, "yyyy-MM-dd") : null;
        const rangeEndKey = rangeEnd ? format(rangeEnd, "yyyy-MM-dd") : null;
        const isRangeStart = rangeStartKey === dayKey;
        const isRangeEnd = rangeEndKey === dayKey;
        const isInRange = !!(
          rangeStartKey &&
          rangeEndKey &&
          dayKey > rangeStartKey &&
          dayKey < rangeEndKey
        );
        const canDragRange = !!onRangeDragStart;
        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            aria-label={format(day, "EEEE, MMMM d, yyyy")}
            aria-selected={isRangeStart || isRangeEnd || isInRange || undefined}
            onClick={() => {
              if (!canDragRange) onSelectDate?.(day);
            }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && onSelectDate) {
                event.preventDefault();
                onSelectDate(day);
              }
            }}
            onMouseDown={(event) => {
              if (!onRangeDragStart) return;
              event.preventDefault();
              onRangeDragStart(day);
            }}
            onMouseEnter={(event) => {
              if (!isRangeSelecting || !onRangeDragEnter) return;
              event.preventDefault();
              onRangeDragEnter(day);
            }}
            onMouseUp={(event) => {
              if (!isRangeSelecting || !onRangeDragEnd) return;
              event.preventDefault();
              onRangeDragEnd(day);
            }}
            onTouchStart={(event) => {
              if (!onRangeDragStart) return;
              event.preventDefault();
              onRangeDragStart(day);
            }}
            onTouchEnd={(event) => {
              if (!isRangeSelecting || !onRangeDragEnd) return;
              event.preventDefault();
              onRangeDragEnd(day);
            }}
            className={cn(
              "min-h-[92px] border-r border-border/60 p-2 transition last:border-r-0 hover:bg-muted/40",
              isRangeStart || isRangeEnd
                ? "bg-primary/15 ring-2 ring-inset ring-primary/60"
                : isInRange && "bg-primary/10"
            )}
          >
            <div className="flex flex-col gap-1.5">
              {dayEvents.map((event) => (
                <EventTooltip key={event.id} event={event} onUserClick={onUserClick}>
                  <div
                    className={cn(
                      "cursor-pointer rounded-xl border px-2 py-1.5 text-[11px] font-medium shadow-sm transition hover:scale-[1.02]",
                      eventColors[event.type]
                    )}
                  >
                    <div className="truncate" title={event.compactLabel}>
                      {event.compactLabel}
                    </div>
                    <div className="mt-0.5 text-[10px] opacity-70">
                      {event.start !== event.end
                        ? `${format(parseISOToLocal(event.start), "MMM d")} → ${format(parseISOToLocal(event.end), "MMM d")}`
                        : format(parseISOToLocal(event.start), "MMM d")}
                    </div>
                  </div>
                </EventTooltip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
