import React, { useMemo } from "react";
import { format, getDaysInMonth } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toneFillClass } from "@/components/ui/tone";
import { cn } from "@/lib/utils";
import { currentBusinessDateISO } from "@/lib/date-format-utils";
import type { DayConflict } from "@/lib/calendarCoverage";
import { ConflictBadge } from "./ConflictBadge";
import { UserAvatar } from "./UserAvatar";
import { userDisplayName, teamLabel } from "./calendarSidebarUtils";
import type { CalendarEvent } from "./types";
import type { User } from "@/types";

interface TimelineViewProps {
  currentMonth: Date;
  users: User[];
  events: CalendarEvent[];
  onUserClick?: (userId: number) => void;
  onEventActivate?: (event: CalendarEvent) => void;
  onRequestTimeOff?: () => void;
  /** Empty cell: starts a booking for that day (an event cell opens its details instead). */
  onSelectDate?: (date: Date) => void;
  conflictsByDate?: ReadonlyMap<string, DayConflict>;
}

const EVENT_STYLE = {
  vacation: {
    cell: "bg-tone-success-surface text-tone-success-text",
    letter: "V",
    tone: "success",
  },
  sick: { cell: "bg-tone-danger-surface text-tone-danger-text", letter: "S", tone: "danger" },
  standby: {
    cell: "bg-tone-warning-surface text-tone-warning-text",
    letter: "SB",
    tone: "warning",
  },
} as const;

const LEGEND = [
  { label: "Vacation", ...EVENT_STYLE.vacation },
  { label: "Sick", ...EVENT_STYLE.sick },
  { label: "Standby", ...EVENT_STYLE.standby },
] as const;

type SpanEntry = { event: CalendarEvent; start: string; end: string };

export const TimelineView: React.FC<TimelineViewProps> = ({
  currentMonth,
  users,
  events,
  onUserClick,
  onEventActivate,
  onRequestTimeOff,
  onSelectDate,
  conflictsByDate,
}) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(currentMonth);
  const todayStr = currentBusinessDateISO();

  // ds-allow-hardcode: Gantt grid geometry (name column + minimum day width)
  const gridTemplateColumns = `200px repeat(${daysInMonth}, minmax(32px, 1fr))`;

  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(year, month, i + 1);
        const dateStr = format(date, "yyyy-MM-dd");
        const dow = date.getDay();
        return {
          dayNum: i + 1,
          dateStr,
          isWeekend: dow === 0 || dow === 6,
          isToday: dateStr === todayStr,
        };
      }),
    [daysInMonth, year, month, todayStr]
  );

  // Index once per events change: holidays by date, spans by user.
  const { holidayByDate, spansByUser } = useMemo(() => {
    const holidays = new Map<string, CalendarEvent>();
    const spans = new Map<number, SpanEntry[]>();
    for (const event of events) {
      if (event.type === "holiday") {
        holidays.set(event.start.slice(0, 10), event);
        continue;
      }
      // Compare calendar dates as strings so the browser timezone cannot shift a span's last day.
      const start = event.start.slice(0, 10);
      const end = event.end.slice(0, 10);
      if (event.userId === undefined || !start || !end) continue;
      const list = spans.get(event.userId) ?? [];
      list.push({ event, start, end });
      spans.set(event.userId, list);
    }
    return { holidayByDate: holidays, spansByUser: spans };
  }, [events]);

  return (
    <div
      data-testid="timeline-view"
      className="bg-card text-card-foreground flex h-full flex-1 flex-col overflow-x-auto overflow-y-auto"
    >
      <div className="border-border/70 bg-card sticky left-0 flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:px-4">
        <div>
          <h2 className="text-foreground text-sm font-bold tracking-tight">
            Team Schedule &amp; Overlap Timeline
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Gantt overview of squad capacity across {format(currentMonth, "MMMM yyyy")}.
          </p>
        </div>
        <ul className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", toneFillClass[item.tone])} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        {onRequestTimeOff && (
          <Button
            size="control-sm"
            onClick={onRequestTimeOff}
            className="gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Request Dates</span>
          </Button>
        )}
      </div>

      {/* ds-allow-hardcode: keeps 30+ day columns legible; the wrapper scrolls horizontally */}
      <div className="min-w-[900px] flex-1">
        <div
          className="border-border/70 bg-muted sticky top-0 z-20 border-b text-center font-mono text-xs"
          style={{ display: "grid", gridTemplateColumns }}
        >
          <div className="text-muted-foreground border-border/60 bg-muted sticky left-0 z-10 border-r p-2 text-left font-sans font-bold">
            Team Member
          </div>
          {days.map((day) => {
            const holiday = holidayByDate.get(day.dateStr);
            const conflict = conflictsByDate?.get(day.dateStr);
            return (
              <div
                key={day.dayNum}
                className={cn(
                  "border-border/40 flex flex-col items-center justify-center border-r py-1.5",
                  day.isToday
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : day.isWeekend
                      ? "bg-muted text-muted-foreground"
                      : "text-foreground",
                  conflict && "border-tone-warning-border bg-tone-warning-surface/40 border-2"
                )}
              >
                <span className="text-xs font-bold">{day.dayNum}</span>
                {conflict && <ConflictBadge conflict={conflict} compact />}
                {holiday && (
                  <span
                    className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", toneFillClass.info)}
                    title={`Holiday: ${holiday.title}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="divide-border/50 divide-y">
          {users.length === 0 ? (
            <div className="text-muted-foreground p-8 text-center text-xs">
              No team members found for selected workspaces.
            </div>
          ) : (
            users.map((user) => {
              const name = userDisplayName(user);
              const spans = spansByUser.get(user.id) ?? [];

              return (
                <div
                  key={user.id}
                  className="hover:bg-muted/20 transition-colors"
                  style={{ display: "grid", gridTemplateColumns }}
                >
                  <div className="border-border/60 bg-card sticky left-0 z-10 border-r">
                    <button
                      type="button"
                      className="hover:bg-muted/40 focus-visible:ring-ring flex w-full min-w-0 items-center gap-2 p-2 text-left focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
                      onClick={() => onUserClick?.(user.id)}
                      title={`View ${name}`}
                      aria-label={`View ${name}`}
                    >
                      <UserAvatar size="xs" name={name} email={user.email} colorSeed={user.id} />
                      <span className="min-w-0">
                        <span className="text-foreground block truncate text-xs font-bold">
                          {name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {teamLabel(user) || "Team"}
                        </span>
                      </span>
                    </button>
                  </div>

                  {days.map((day) => {
                    const active = spans.find(
                      (s) => day.dateStr >= s.start && day.dateStr <= s.end
                    );
                    if (!active) {
                      const emptyClass = cn(
                        "border-border/40 h-10 border-r",
                        day.isWeekend && "bg-muted/30",
                        conflictsByDate?.has(day.dateStr) && "bg-tone-warning-surface/40"
                      );
                      if (!onSelectDate) return <div key={day.dayNum} className={emptyClass} />;
                      return (
                        <button
                          key={day.dayNum}
                          type="button"
                          onClick={() => onSelectDate(new Date(year, month, day.dayNum))}
                          className={cn(
                            emptyClass,
                            "hover:bg-primary/10 focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset"
                          )}
                          aria-label={`Book time off for ${name} on ${day.dateStr}`}
                        />
                      );
                    }
                    const style =
                      EVENT_STYLE[active.event.type as keyof typeof EVENT_STYLE] ??
                      EVENT_STYLE.standby;
                    return (
                      <button
                        key={day.dayNum}
                        type="button"
                        onClick={() => onEventActivate?.(active.event)}
                        className={cn(
                          "border-border/40 focus-visible:ring-ring flex h-10 items-center justify-center border-r font-mono text-xs font-bold transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-hidden focus-visible:ring-inset",
                          style.cell
                        )}
                        title={`${name}: ${active.event.title} (${active.event.type})`}
                        aria-label={`${name}: ${active.event.title} (${active.event.type}) on ${day.dateStr}`}
                      >
                        {style.letter}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
