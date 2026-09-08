/**
 * Roster aggregation utilities.
 *
 * Groups raw StandbyLog rows (one per shift) into one row per person,
 * so the roster/by-team views show a summary per user instead of a long
 * list of individual shifts. This keeps the dashboard clean and scannable
 * — the CR user sees "who is on standby" at a glance, not every single
 * shift entry.
 */
import type { ControlRoomRosterRow } from "../types";

export interface AggregatedUserRow {
  id: number;
  user_id: number;
  user_name: string;
  username: string;
  team_names: string[];
  shift_count: number;
  total_hours: number;
  first_date: string;
  last_date: string;
  has_overnight: boolean;
}

/**
 * Group roster rows by user_id, producing one aggregated row per person.
 * Each row shows: name, teams, shift count, total hours, date range.
 */
const createAggregatedUser = (row: ControlRoomRosterRow): AggregatedUserRow => ({
  id: row.user_id,
  user_id: row.user_id,
  user_name: row.user_name,
  username: row.username,
  team_names: [...row.team_names],
  shift_count: 1,
  total_hours: row.hours,
  first_date: row.date,
  last_date: row.date,
  has_overnight: row.is_overnight,
});

const mergeTeamNames = (target: string[], names: string[]) => {
  for (const name of names) {
    if (!target.includes(name)) target.push(name);
  }
};

const mergeRosterRow = (existing: AggregatedUserRow, row: ControlRoomRosterRow) => {
  existing.shift_count += 1;
  existing.total_hours += row.hours;
  existing.has_overnight ||= row.is_overnight;
  existing.first_date = row.date < existing.first_date ? row.date : existing.first_date;
  existing.last_date = row.date > existing.last_date ? row.date : existing.last_date;
  mergeTeamNames(existing.team_names, row.team_names);
};

export const aggregateByUser = (roster: ControlRoomRosterRow[]): AggregatedUserRow[] => {
  const map = new Map<number, AggregatedUserRow>();
  for (const row of roster) {
    const existing = map.get(row.user_id);
    if (existing) mergeRosterRow(existing, row);
    else map.set(row.user_id, createAggregatedUser(row));
  }
  return Array.from(map.values()).sort((a, b) => a.user_name.localeCompare(b.user_name));
};

/**
 * Group roster rows by team_name, then aggregate by user within each team.
 * Returns one entry per team, each containing its aggregated user rows.
 */
export interface TeamAggregatedGroup {
  team_name: string;
  users: AggregatedUserRow[];
}

export const aggregateByTeamThenUser = (roster: ControlRoomRosterRow[]): TeamAggregatedGroup[] => {
  const teamMap = new Map<string, ControlRoomRosterRow[]>();

  for (const row of roster) {
    for (const team of row.team_names) {
      const list = teamMap.get(team) ?? [];
      list.push(row);
      teamMap.set(team, list);
    }
  }

  return Array.from(teamMap.entries())
    .map(([team_name, rows]) => ({
      team_name,
      users: aggregateByUser(rows),
    }))
    .sort((a, b) => a.team_name.localeCompare(b.team_name));
};
