import { describe, expect, it } from "vitest";
import type { ControlRoomRosterRow } from "../types";
import { aggregateByTeamThenUser, aggregateByUser } from "./rosterAggregation";

const row = (overrides: Partial<ControlRoomRosterRow> = {}): ControlRoomRosterRow => ({
  id: 1,
  date: "2026-07-02",
  user_id: 7,
  user_name: "Alice Example",
  username: "alice",
  team_names: ["Team A"],
  hours: 8,
  start_time: "08:00",
  end_time: "16:00",
  is_overnight: false,
  status: "approved",
  status_display: "Approved",
  description: "",
  ...overrides,
});

describe("rosterAggregation", () => {
  it("merges shifts by user and deduplicates teams", () => {
    const result = aggregateByUser([
      row(),
      row({ id: 2, date: "2026-07-01", team_names: ["Team A", "Team B"], hours: 4 }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        user_id: 7,
        shift_count: 2,
        total_hours: 12,
        first_date: "2026-07-01",
        last_date: "2026-07-02",
        team_names: ["Team A", "Team B"],
      }),
    ]);
  });

  it("groups team views and preserves users in each team", () => {
    const result = aggregateByTeamThenUser([
      row({ team_names: ["Team A", "Team B"] }),
      row({ id: 2, user_id: 8, user_name: "Bob Example", username: "bob" }),
    ]);

    expect(result.map((group) => group.team_name)).toEqual(["Team A", "Team B"]);
    expect(result[0].users.map((user) => user.user_name)).toEqual(["Alice Example", "Bob Example"]);
    expect(result[1].users.map((user) => user.user_name)).toEqual(["Alice Example"]);
  });
});
