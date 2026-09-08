import { describe, it, expect, vi, afterEach } from "vitest";
import { calcHours } from "./calcHours";

const mockDate = new Date("2024-06-15");

const members = [
  { user: { id: 1 }, teams_detail: [{ id: 1 }] },
  { user: { id: 2 }, teams_detail: [{ id: 2 }] },
  { user: { id: 3 } },
];

const logs = [
  { user: 1, date: "2024-06-10", hours: 5, status: "approved" },
  { user: 2, date: "2024-06-12", hours: 3, status: "approved" },
  { user: 1, date: "2024-06-20", hours: 4, status: "pending" },
  { user: 2, date: "2024-06-25", hours: 2, status: "rejected" },
  { user: 1, date: "2024-05-30", hours: 8, status: "approved" },
  { user: 1, date: "2024-06-15", hours: undefined, status: "approved" },
];

describe("calcHours", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 for undefined logs", () => {
    expect(calcHours(undefined as any, members, "all", "", "", true)).toBe(0);
  });

  it("sums approved hours in current month with no filters", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "", "", true);
    expect(result).toBe(5 + 3);
  });

  it("applies dateFrom filter", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "2024-06-11", "", true);
    expect(result).toBe(3);
  });

  it("applies dateTo filter", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "", "2024-06-11", true);
    expect(result).toBe(5);
  });

  it("filters by team", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "1", "", "", true);
    expect(result).toBe(5);
  });

  it("excludes logs from users not in the selected team", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "2", "", "", true);
    expect(result).toBe(3);
  });

  it("excludes logs when member has no team data", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithNoTeamMember = [{ user: 3, date: "2024-06-15", hours: 10, status: "approved" }];
    const result = calcHours(logsWithNoTeamMember, members, "1", "", "", true);
    expect(result).toBe(0);
  });

  it("includes pending/rejected hours when statusCheck is disabled", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "", "", false);
    expect(result).toBe(5 + 3 + 4 + 2);
  });

  it("returns 0 for hours when log has no hours value", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithNoHours = [{ user: 1, date: "2024-06-15", hours: undefined, status: "approved" }];
    const result = calcHours(logsWithNoHours, members, "all", "", "", true);
    expect(result).toBe(0);
  });

  it("excludes logs from previous months", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "", "", true);
    expect(result).not.toContain(8);
  });

  // Branch coverage: missing teams_detail
  it("excludes log when filterTeam is set but member has no teams_detail", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithUser3 = [{ user: 3, date: "2024-06-15", hours: 10, status: "approved" }];
    const result = calcHours(logsWithUser3, members, "1", "", "", true);
    expect(result).toBe(0);
  });

  it("includes log when filterTeam is 'all' even if member has no teams_detail", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithUser3 = [{ user: 3, date: "2024-06-15", hours: 10, status: "approved" }];
    const result = calcHours(logsWithUser3, members, "all", "", "", true);
    expect(result).toBe(10);
  });

  // Branch coverage: combined filters
  it("combines team filter with dateFrom", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "1", "2024-06-11", "", true);
    expect(result).toBe(0); // user 1's approved log in current month is on 2024-06-10, excluded by dateFrom
  });

  it("combines team filter with dateTo", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "1", "", "2024-06-11", true);
    expect(result).toBe(5);
  });

  it("combines team filter with statusCheck disabled", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "1", "", "", false);
    // user 1: 2024-06-10 (5h approved), 2024-06-20 (4h pending), 2024-06-15 (0h approved)
    expect(result).toBe(5 + 4);
  });

  it("combines dateFrom and dateTo", () => {
    vi.useFakeTimers({ now: mockDate });
    const result = calcHours(logs, members, "all", "2024-06-12", "2024-06-20", true);
    // user 2: 2024-06-12 (3h approved), user 1: 2024-06-20 pending excluded by statusCheck
    expect(result).toBe(3);
  });

  // Branch coverage: missing hours value
  it("treats missing hours as 0 in reduce", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithMissingHours = [
      { user: 1, date: "2024-06-15", status: "approved" },
      { user: 1, date: "2024-06-16", hours: 7, status: "approved" },
    ];
    const result = calcHours(logsWithMissingHours, members, "all", "", "", true);
    expect(result).toBe(7);
  });

  it("excludes logs from members not found in membersData when filterTeam is set", () => {
    vi.useFakeTimers({ now: mockDate });
    const logsWithUnknownUser = [{ user: 99, date: "2024-06-15", hours: 10, status: "approved" }];
    const result = calcHours(logsWithUnknownUser, members, "1", "", "", true);
    expect(result).toBe(0);
  });
});
