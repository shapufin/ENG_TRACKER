import { describe, it, expect } from "vitest";
import { filterHoursLogs, calculateHoursStats } from "./hoursLogsFilter";

const logs = [
  { id: 1, user_name: "Alice", date: "2024-06-15", description: "Project A", status: "approved" },
  { id: 2, user_name: "Bob", date: "2024-06-20", description: "Project B", status: "pending" },
  {
    id: 3,
    user_name: "Charlie",
    date: "2024-06-25",
    description: "Urgent fix",
    status: "rejected",
  },
];

describe("filterHoursLogs", () => {
  it("returns empty array when logs is undefined", () => {
    expect(filterHoursLogs(undefined, "all", "", "", "")).toEqual([]);
  });

  it("returns all logs sorted by date descending when no filters are applied", () => {
    const result = filterHoursLogs(logs, "all", "", "", "");
    expect(result.map((l) => l.id)).toEqual([3, 2, 1]);
  });

  it("filters by status", () => {
    const result = filterHoursLogs(logs, "pending", "", "", "");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("pending");
  });

  it("excludes logs outside the date range", () => {
    const result = filterHoursLogs(logs, "all", "2024-06-18", "2024-06-22", "");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("filters by search query in user_name", () => {
    const result = filterHoursLogs(logs, "all", "", "", "ali");
    expect(result).toHaveLength(1);
    expect(result[0].user_name).toBe("Alice");
  });

  it("filters by search query in description", () => {
    const result = filterHoursLogs(logs, "all", "", "", "urgent");
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Urgent fix");
  });

  it("returns empty when search query matches nothing", () => {
    const result = filterHoursLogs(logs, "all", "", "", "missing");
    expect(result).toHaveLength(0);
  });

  it("combines status and date filters", () => {
    const result = filterHoursLogs(logs, "approved", "2024-06-10", "2024-06-30", "");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("approved");
  });

  it("combines status and search filters", () => {
    const result = filterHoursLogs(logs, "pending", "", "", "bo");
    expect(result).toHaveLength(1);
    expect(result[0].user_name).toBe("Bob");
  });

  it("returns empty when status filter matches nothing", () => {
    const result = filterHoursLogs(logs, "approved", "2024-06-20", "2024-06-30", "");
    expect(result).toHaveLength(0);
  });

  // Branch coverage: missing optional fields
  it("handles logs with missing user_name (search falls back to description only)", () => {
    const logsWithoutName = [
      { id: 4, date: "2024-06-15", description: "Special", status: "approved" },
    ];
    const result = filterHoursLogs(logsWithoutName, "all", "", "", "special");
    expect(result).toHaveLength(1);
  });

  it("handles logs with missing description (search falls back to user_name only)", () => {
    const logsWithoutDesc = [{ id: 5, user_name: "Dave", date: "2024-06-15", status: "approved" }];
    const result = filterHoursLogs(logsWithoutDesc, "all", "", "", "dave");
    expect(result).toHaveLength(1);
  });

  it("handles logs with both user_name and description missing (search matches nothing)", () => {
    const logsWithoutEither = [{ id: 6, date: "2024-06-15", status: "approved" }];
    const result = filterHoursLogs(logsWithoutEither, "all", "", "", "anything");
    expect(result).toHaveLength(0);
  });

  it("filters by dateFrom only (no dateTo)", () => {
    const result = filterHoursLogs(logs, "all", "2024-06-22", "", "");
    expect(result.map((l) => l.id)).toEqual([3]);
  });

  it("filters by dateTo only (no dateFrom)", () => {
    const result = filterHoursLogs(logs, "all", "", "2024-06-18", "");
    // Logs on 2024-06-15 (id 1) is <= 2024-06-18; logs on 06-20 and 06-25 excluded
    expect(result.map((l) => l.id)).toEqual([1]);
  });

  it("search query is case-insensitive on user_name", () => {
    const result = filterHoursLogs(logs, "all", "", "", "ALICE");
    expect(result).toHaveLength(1);
    expect(result[0].user_name).toBe("Alice");
  });

  it("search query is case-insensitive on description", () => {
    const result = filterHoursLogs(logs, "all", "", "", "URGENT");
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Urgent fix");
  });

  it("status 'all' returns all logs regardless of status", () => {
    const result = filterHoursLogs(logs, "all", "", "", "");
    expect(result).toHaveLength(3);
  });

  it("rejects log when status matches but date range excludes it", () => {
    const result = filterHoursLogs(logs, "approved", "2024-06-16", "2024-06-19", "");
    expect(result).toHaveLength(0);
  });
});

describe("calculateHoursStats", () => {
  it("returns zero stats for undefined logs", () => {
    expect(calculateHoursStats(undefined)).toEqual({
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    });
  });

  it("counts statuses correctly", () => {
    expect(calculateHoursStats(logs)).toEqual({ total: 3, pending: 1, approved: 1, rejected: 1 });
  });
});
