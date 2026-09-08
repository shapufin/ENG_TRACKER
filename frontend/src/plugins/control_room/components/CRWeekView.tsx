/**
 * CRWeekView — 7-column strip showing the current week (Mon→Sun).
 *
 * Always shows the current calendar week, regardless of the date range
 * filter. Respects the team filter (selectedTeamIds) — only shows
 * standby for the user's filtered teams.
 *
 * Each day column shows:
 *   - Weekday name + date number (e.g. "Mon 29")
 *   - Person count badge
 *   - List of people on standby with shift times + team badge
 *   - Overnight moon icon for overnight shifts
 *
 * Today's column is highlighted. Weekend columns have a subtle tint.
 * Empty days show "No standby" dimmed text.
 *
 * Pure presentational component — data is fetched by the parent page
 * via a dedicated useControlRoomDashboard call for the week range.
 */
import React, { useMemo } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isToday, parseISO } from "date-fns";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ControlRoomRosterRow } from "../types";
import { formatTime } from "../utils/controlRoomFormatters";
import { groupRowsByDate, sortByStartTime, initialsOf } from "../utils/crViewHelpers";
import { OvernightIcon, TeamChipList } from "../utils/crViewIcons";

interface Props {
  roster: ControlRoomRosterRow[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DayData {
  date: Date;
  iso: string;
  weekday: string;
  dayNum: string;
  rows: ControlRoomRosterRow[];
  isToday: boolean;
  isWeekend: boolean;
}

const buildWeekDays = (roster: ControlRoomRosterRow[]): DayData[] => {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }); // Sunday
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Group roster rows by ISO date.
  const rowsByDate = groupRowsByDate(roster);

  return days.map((date, idx) => {
    const iso = format(date, "yyyy-MM-dd");
    const rows = sortByStartTime(rowsByDate.get(iso) ?? []);
    return {
      date,
      iso,
      weekday: WEEKDAY_LABELS[idx],
      dayNum: format(date, "d"),
      rows,
      isToday: isToday(date),
      isWeekend: idx >= 5,
    };
  });
};

const DayColumn: React.FC<{ day: DayData }> = ({ day }) => (
  <div
    className={cn(
      "flex min-h-[280px] flex-col rounded-xl border p-3 transition-colors",
      day.isToday
        ? "border-primary/60 bg-primary/5"
        : day.isWeekend
          ? "border-border/30 bg-muted/20"
          : "border-border/40 bg-card/40"
    )}
  >
    {/* Header: weekday + date */}
    <div className="mb-3 flex items-center justify-between border-b border-border/30 pb-2">
      <div className="flex items-center gap-2">
        <span
          className={cn("text-sm font-semibold", day.isToday ? "text-primary" : "text-foreground")}
        >
          {day.weekday}
        </span>
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums",
            day.isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {day.dayNum}
        </span>
      </div>
      {day.rows.length > 0 && (
        <Badge variant="secondary" className="text-[10px] tabular-nums">
          {day.rows.length}
        </Badge>
      )}
    </div>

    {/* People on standby */}
    <div className="flex-1 space-y-2">
      {day.rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground/50">No standby</p>
      ) : (
        day.rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "rounded-lg border p-2.5 transition-colors",
              day.isToday
                ? "border-primary/20 bg-background/60"
                : "border-border/30 bg-background/40"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-foreground">
                {initialsOf(row.user_name)}
              </span>
              <span
                className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium"
                title={row.user_name}
              >
                {row.user_name}
                {row.is_overnight && <OvernightIcon />}
              </span>
            </div>
            <TeamChipList teamNames={row.team_names} className="mt-1" />
            <div className="mt-1.5 text-xs tabular-nums text-muted-foreground">
              {formatTime(row.start_time)} – {formatTime(row.end_time)}
            </div>
          </div>
        ))
      )}
    </div>
  </div>
);

export const CRWeekView: React.FC<Props> = ({ roster }) => {
  // Filter roster to only this week's rows (in case the parent passed
  // a broader range — the parent should pass week-scoped data, but this
  // is a safety net).
  const weekRoster = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    return roster.filter((row) => {
      const d = parseISO(row.date);
      return d >= weekStart && d <= weekEnd;
    });
  }, [roster]);

  const weekDays = useMemo(() => buildWeekDays(weekRoster), [weekRoster]);
  const totalPeople = useMemo(() => {
    const ids = new Set(weekRoster.map((r) => r.user_id));
    return ids.size;
  }, [weekRoster]);

  // Derive range from the already-computed week days (avoids a second
  // new Date() call). Fall back to direct computation if weekDays is
  // somehow empty.
  const weekStart = weekDays[0]?.date ?? startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = weekDays[6]?.date ?? endOfWeek(new Date(), { weekStartsOn: 1 });

  return (
    <GlassCard isHoverLift={false} delay={0} className="space-y-4 p-4">
      {/* Week summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {totalPeople} {totalPeople === 1 ? "person" : "people"} on standby this week
          </p>
        </div>
      </div>

      {/* 7-column grid — horizontal scroll on small screens */}
      {weekRoster.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No standby scheduled this week.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[700px] grid-cols-7 gap-2 lg:min-w-0">
            {weekDays.map((day) => (
              <DayColumn key={day.iso} day={day} />
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
};
