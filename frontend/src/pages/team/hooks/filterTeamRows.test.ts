import { describe, expect, it } from "vitest";
import { filterTeamRows } from "./filterTeamRows";

const options = {
  filterStatus: "all",
  filterTeam: "all",
  dateFrom: "",
  dateTo: "",
  normalizedSearch: "",
  userTeamMap: new Map<number, number[]>(),
};

const rows = [
  { user: 1, status: "approved", date: "2026-08-03", user_full_name: "Alice Smith" },
  { user: 2, status: "pending", date: "2026-08-01", user_full_name: "Bob Jones" },
  { user: 3, status: "rejected", date: "2026-08-02", reason: "Client issue" },
];

describe("filterTeamRows", () => {
  it("returns rows sorted newest first", () => {
    expect(filterTeamRows(rows, options).map((row) => row.user)).toEqual([1, 3, 2]);
  });

  it("filters by status, team, and search", () => {
    expect(
      filterTeamRows(rows, {
        ...options,
        filterStatus: "pending",
        filterTeam: "20",
        normalizedSearch: "bob",
        userTeamMap: new Map([
          [1, [10]],
          [2, [20]],
          [3, [30]],
        ]),
      }).map((row) => row.user)
    ).toEqual([2]);
  });

  it("filters date ranges across date fields", () => {
    expect(
      filterTeamRows(
        [
          { user: 1, status: "approved", start_date: "2026-08-02", end_date: "2026-08-03" },
          { user: 2, status: "approved", start_date: "2026-08-05", end_date: "2026-08-06" },
        ],
        { ...options, dateFrom: "2026-08-02", dateTo: "2026-08-04" }
      ).map((row) => row.user)
    ).toEqual([1]);
  });

  it("returns an empty list for unavailable rows", () => {
    expect(filterTeamRows(undefined, options)).toEqual([]);
  });
});
