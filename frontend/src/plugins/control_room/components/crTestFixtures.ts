/**
 * Shared test fixtures for Control Room dashboard view components.
 *
 * Extracted to eliminate duplication between CRByTeamView.test.tsx and
 * CRByDayView.test.tsx (flagged by fallow dupes analysis).
 */
import type { ControlRoomCoverage, ControlRoomRosterRow } from "../types";

export const mockCoverage: ControlRoomCoverage[] = [
  {
    team_id: 1,
    team_name: "Alpha",
    team_code: "AL",
    member_count: 5,
    covered_member_count: 4,
    planned_hours: 20,
    approved_hours: 12,
    pending_hours: 8,
    coverage_percent: 80,
  },
  {
    team_id: 2,
    team_name: "Beta",
    team_code: "BE",
    member_count: 3,
    covered_member_count: 3,
    planned_hours: 15,
    approved_hours: 15,
    pending_hours: 0,
    coverage_percent: 100,
  },
];

/** Base roster: 2 people on 2026-07-27 (Alice approved, Bob overnight pending). */
export const mockRoster: ControlRoomRosterRow[] = [
  {
    id: 1,
    date: "2026-07-27",
    user_id: 10,
    user_name: "Alice",
    username: "alice",
    team_names: ["Alpha"],
    hours: 4,
    start_time: "08:00:00",
    end_time: "12:00:00",
    is_overnight: false,
    status: "approved",
    status_display: "Approved",
    description: "",
  },
  {
    id: 2,
    date: "2026-07-27",
    user_id: 11,
    user_name: "Bob",
    username: "bob",
    team_names: ["Beta"],
    hours: 8,
    start_time: "22:00:00",
    end_time: "06:00:00",
    is_overnight: true,
    status: "pending",
    status_display: "Pending",
    description: "",
  },
];

/** Extra row on 2026-07-28 for multi-day tests (CRByDayView). */
export const extraDayRow: ControlRoomRosterRow = {
  id: 3,
  date: "2026-07-28",
  user_id: 10,
  user_name: "Alice",
  username: "alice",
  team_names: ["Alpha"],
  hours: 6,
  start_time: "09:00:00",
  end_time: "15:00:00",
  is_overnight: false,
  status: "approved",
  status_display: "Approved",
  description: "",
};
