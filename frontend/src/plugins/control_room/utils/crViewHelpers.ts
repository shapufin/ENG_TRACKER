/**
 * Shared helpers for Control Room calendar/week view components.
 *
 * Extracted from CRWeekView + CRByDayView to eliminate duplication:
 * - Team color mapping (deterministic, stable per team name)
 * - Initials extraction from full names
 * - Day grouping (roster rows → Map<isoDate, rows[]>)
 * - Row sorting by start time
 *
 * Pure functions only — no React components. The OvernightIcon component
 * lives in crViewHelpers.tsx to keep this file fast-refresh-safe.
 */
import type { ControlRoomRosterRow } from "../types";

// ---------------------------------------------------------------------------
// Team colors
// ---------------------------------------------------------------------------

const TEAM_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
];

const teamColorCache = new Map<string, string>();

/**
 * Deterministic color class for a team name.
 *
 * Uses a djb2 hash of the name so the same team always maps to the
 * same color regardless of which component renders first or what order
 * teams are encountered. The cache avoids recomputing the hash.
 */
export const teamColorFor = (teamName: string): string => {
  let c = teamColorCache.get(teamName);
  if (!c) {
    // djb2 hash — fast, good distribution, deterministic.
    let hash = 5381;
    for (let i = 0; i < teamName.length; i++) {
      hash = ((hash << 5) + hash) ^ teamName.charCodeAt(i);
    }
    const idx = Math.abs(hash) % TEAM_COLORS.length;
    c = TEAM_COLORS[idx];
    teamColorCache.set(teamName, c);
  }
  return c;
};

// ---------------------------------------------------------------------------
// Initials
// ---------------------------------------------------------------------------

/** Extract up to 2 initials from a full name (e.g. "Alice Smith" → "AS"). */
export const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// ---------------------------------------------------------------------------
// Day grouping + row sorting
// ---------------------------------------------------------------------------

/** Group roster rows by their ISO date string into a Map. */
export const groupRowsByDate = (
  roster: ControlRoomRosterRow[]
): Map<string, ControlRoomRosterRow[]> => {
  const map = new Map<string, ControlRoomRosterRow[]>();
  for (const row of roster) {
    const list = map.get(row.date) ?? [];
    list.push(row);
    map.set(row.date, list);
  }
  return map;
};

/** Sort a copy of roster rows by start_time ascending (nulls sort first). */
export const sortByStartTime = (rows: ControlRoomRosterRow[]): ControlRoomRosterRow[] =>
  [...rows].sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
