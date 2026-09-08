/**
 * CRByDayView — calendar grid layout for "who is on standby" by day.
 *
 * Renders a month calendar grid (7 columns Sun–Sat, rows = weeks).
 * Each day cell shows the date number and compact avatar initials for
 * people on standby that day. Days with no standby are dimmed. Today is
 * highlighted. Status badge removed (approved-only dashboard).
 *
 * Hovering a day cell opens a Popover with full details for every
 * person on standby that day: name, team(s), shift times, overnight
 * flag. The popover content is scrollable so it handles days with many
 * users without overflowing the viewport.
 *
 * The grid is built from the roster data's date range. If the range
 * spans multiple months, all months are rendered stacked vertically.
 * Pure client-side grouping — no new endpoints.
 */
import React, { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { GlassCard } from "@/components/ui/GlassCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ControlRoomRosterRow } from "../types";
import { formatTime } from "../utils/controlRoomFormatters";
import { teamColorFor, initialsOf, groupRowsByDate, sortByStartTime } from "../utils/crViewHelpers";
import { OvernightIcon, TeamChipList } from "../utils/crViewIcons";

interface Props {
  roster: ControlRoomRosterRow[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MonthGrid {
  monthLabel: string;
  monthDate: Date;
  weeks: Date[][];
}

/** Build calendar grids covering the roster's date range. */
const buildMonthGrids = (roster: ControlRoomRosterRow[]): MonthGrid[] => {
  if (roster.length === 0) return [];

  const dates = roster.map((r) => parseISO(r.date));
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const grids: MonthGrid[] = [];
  let cursor = startOfMonth(minDate);
  const last = endOfMonth(maxDate);

  while (cursor <= last) {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

    const weeks: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }

    grids.push({
      monthLabel: format(monthStart, "MMMM yyyy"),
      monthDate: monthStart,
      weeks,
    });

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return grids;
};

/**
 * DayDetailPopover — the hover content for a day cell.
 *
 * Shows a scrollable list of every person on standby that day with
 * their team(s), shift times, and overnight flag. Scrollable so it
 * handles 20+ people without overflowing the viewport.
 */
const DayDetailPopover: React.FC<{
  day: Date;
  rows: ControlRoomRosterRow[];
}> = ({ day, rows }) => {
  const sorted = sortByStartTime(rows);

  return (
    <div className="w-72">
      <div className="mb-2 border-b border-border/40 pb-2">
        <p className="text-sm font-semibold">{format(day, "EEEE, MMM d")}</p>
        <p className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "person" : "people"} on standby
        </p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {sorted.map((row) => (
          <div key={row.id} className="rounded-lg border border-border/30 bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{row.user_name}</span>
              {row.is_overnight && <OvernightIcon />}
            </div>
            <TeamChipList teamNames={row.team_names} className="mt-1" />
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {formatTime(row.start_time)} – {formatTime(row.end_time)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DayCell: React.FC<{
  day: Date;
  rows: ControlRoomRosterRow[];
  inMonth: boolean;
}> = ({ day, rows, inMonth }) => {
  const [open, setOpen] = useState(false);
  const today = isToday(day);
  const sortedRows = sortByStartTime(rows);
  const hasPeople = inMonth && sortedRows.length > 0;
  // Show up to 4 avatar chips in the cell; rest counted as "+N".
  const visible = sortedRows.slice(0, 4);
  const overflow = sortedRows.length - visible.length;

  // The cell is a Popover trigger only when there are people. Empty
  // cells are static (no hover content).
  const cellContent = (
    <div
      className={cn(
        "min-h-[88px] rounded-lg border p-1.5 text-left transition-colors",
        inMonth ? "border-border/50 bg-card/40" : "border-transparent bg-muted/10",
        today && "border-primary/60 bg-primary/5",
        hasPeople && "border-primary/30 bg-primary/5",
        hasPeople && "cursor-pointer hover:border-primary/50 hover:bg-primary/10"
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "text-xs font-semibold tabular-nums",
            inMonth ? "text-foreground" : "text-muted-foreground/40",
            today && "text-primary"
          )}
        >
          {format(day, "d")}
        </span>
        {hasPeople && (
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {sortedRows.length}
          </span>
        )}
      </div>
      {hasPeople && (
        <div className="flex flex-wrap gap-0.5">
          {visible.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-0.5 rounded bg-background/80 px-1 py-0.5 text-[9px] font-medium leading-none"
              title={row.user_name}
            >
              {row.team_names[0] && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    teamColorFor(row.team_names[0])
                  )}
                />
              )}
              <span className="truncate">{initialsOf(row.user_name)}</span>
              {row.is_overnight && <OvernightIcon size="xs" />}
            </div>
          ))}
          {overflow > 0 && (
            <span className="flex items-center rounded bg-muted px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground">
              +{overflow}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (!hasPeople) return cellContent;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{cellContent}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={4}
        className="w-72 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DayDetailPopover day={day} rows={sortedRows} />
      </PopoverContent>
    </Popover>
  );
};

const MonthBlock: React.FC<{
  grid: MonthGrid;
  rowsByDate: Map<string, ControlRoomRosterRow[]>;
}> = ({ grid, rowsByDate }) => (
  <GlassCard isHoverLift={false} className="p-4 md:p-5">
    <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{grid.monthLabel}</h3>
    <div className="mb-1 grid grid-cols-7 gap-1">
      {WEEKDAYS.map((day) => (
        <div
          key={day}
          className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          {day}
        </div>
      ))}
    </div>
    <div className="space-y-1">
      {grid.weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const rows = rowsByDate.get(iso) ?? [];
            return (
              <DayCell key={iso} day={day} rows={rows} inMonth={isSameMonth(day, grid.monthDate)} />
            );
          })}
        </div>
      ))}
    </div>
  </GlassCard>
);

export const CRByDayView: React.FC<Props> = ({ roster }) => {
  const rowsByDate = useMemo(() => groupRowsByDate(roster), [roster]);

  const grids = useMemo(() => buildMonthGrids(roster), [roster]);

  if (grids.length === 0) {
    return (
      <GlassCard delay={0}>
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No standby scheduled in this range.
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {grids.map((grid) => (
        <MonthBlock key={grid.monthLabel} grid={grid} rowsByDate={rowsByDate} />
      ))}
    </div>
  );
};
