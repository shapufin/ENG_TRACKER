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

  it("matches leave requests that overlap a single selected date", () => {
    // Leave spans Aug 1 to Aug 10; user filters on Aug 5
    expect(
      filterTeamRows(
        [
          { user: 1, status: "approved", start_date: "2026-08-01", end_date: "2026-08-10" },
          { user: 2, status: "approved", start_date: "2026-08-06", end_date: "2026-08-08" },
        ],
        { ...options, dateFrom: "2026-08-05", dateTo: "2026-08-05" }
      ).map((row) => row.user)
    ).toEqual([1]);
  });

  it("filters by username when user_full_name is also populated", () => {
    const data = [
      {
        user: 1,
        status: "approved",
        date: "2026-08-03",
        user_full_name: "Alice Smith",
        user_name: "asmith",
      },
      {
        user: 2,
        status: "approved",
        date: "2026-08-03",
        user_full_name: "Bob Jones",
        user_name: "bjones",
      },
    ];
    expect(
      filterTeamRows(data, { ...options, normalizedSearch: "asmith" }).map((r) => r.user)
    ).toEqual([1]);
  });

  it("filters by user_code", () => {
    const data = [
      {
        user: 1,
        status: "approved",
        date: "2026-08-03",
        user_name: "asmith",
        user_code: "EMP-042",
      },
      {
        user: 2,
        status: "approved",
        date: "2026-08-03",
        user_name: "bjones",
        user_code: "EMP-099",
      },
    ];
    expect(
      filterTeamRows(data, { ...options, normalizedSearch: "emp-042" }).map((r) => r.user)
    ).toEqual([1]);
  });

  it("resolves username via userSearchMap when not on row directly", () => {
    const data = [
      { user: 1, status: "approved", date: "2026-08-03", user_name: "Alice Smith" },
      { user: 2, status: "approved", date: "2026-08-03", user_name: "Bob Jones" },
    ];
    const userSearchMap = new Map([
      [1, ["asmith", "alice smith", "emp-001"]],
      [2, ["bjones", "bob jones", "emp-002"]],
    ]);
    expect(
      filterTeamRows(data, { ...options, normalizedSearch: "asmith", userSearchMap }).map(
        (r) => r.user
      )
    ).toEqual([1]);
  });

  it("filters by date AND username simultaneously", () => {
    const data = [
      {
        user: 1,
        status: "approved",
        date: "2026-08-03",
        user_full_name: "Alice Smith",
        user_name: "asmith",
      },
      {
        user: 1,
        status: "approved",
        date: "2026-08-10",
        user_full_name: "Alice Smith",
        user_name: "asmith",
      },
      {
        user: 2,
        status: "approved",
        date: "2026-08-03",
        user_full_name: "Bob Jones",
        user_name: "bjones",
      },
    ];
    expect(
      filterTeamRows(data, {
        ...options,
        dateFrom: "2026-08-01",
        dateTo: "2026-08-05",
        normalizedSearch: "asmith",
      }).map((r) => r.date)
    ).toEqual(["2026-08-03"]);
  });

  it("returns an empty list for unavailable rows", () => {
    expect(filterTeamRows(undefined, options)).toEqual([]);
  });
});
