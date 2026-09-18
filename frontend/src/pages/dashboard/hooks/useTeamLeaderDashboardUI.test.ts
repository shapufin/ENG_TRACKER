import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTeamLeaderDashboardUI } from "./useTeamLeaderDashboardUI";

describe("useTeamLeaderDashboardUI", () => {
  it("returns zero counts when teamStats is null", () => {
    const { result } = renderHook(() => useTeamLeaderDashboardUI({ teamStats: null } as any));
    expect(result.current.pendingCounts).toEqual({ overtime: 0, standby: 0, leave: 0, total: 0 });
    expect(result.current.queueSegments).toEqual([
      { label: "Overtime", value: 0, percentage: 0, accent: "bg-primary" },
      { label: "Standby", value: 0, percentage: 0, accent: "bg-warning" },
      { label: "Leave", value: 0, percentage: 0, accent: "bg-success" },
    ]);
  });

  it("computes pending counts and percentages", () => {
    const { result } = renderHook(() =>
      useTeamLeaderDashboardUI({
        teamStats: { pending_team_overtime: 2, pending_team_standby: 1, pending_team_leaves: 7 },
      } as any)
    );
    expect(result.current.pendingCounts).toEqual({ overtime: 2, standby: 1, leave: 7, total: 10 });
    expect(result.current.queueSegments[0].percentage).toBe(20);
    expect(result.current.queueSegments[1].percentage).toBe(10);
    expect(result.current.queueSegments[2].percentage).toBe(70);
  });

  it("maps top pending users and queue highlights", () => {
    const { result } = renderHook(() =>
      useTeamLeaderDashboardUI({
        teamStats: null,
        topPendingUsers: [{ user_id: 1, user_name: "Alice", pending_count: 3 }],
        queueHighlights: [
          {
            id: 1,
            type: "leave",
            user_name: "Alice",
            date: "2024-06-01",
            details: "",
            status: "pending",
          },
        ],
      } as any)
    );
    expect(result.current.uiTopPendingUsers).toEqual([{ userId: 1, userName: "Alice", count: 3 }]);
    expect(result.current.uiQueueHighlights).toEqual([
      {
        id: 1,
        type: "leave",
        userName: "Alice",
        date: "2024-06-01",
        details: "",
        status: "pending",
        tag: null,
        hours: null,
        days: null,
      },
    ]);
  });

  const mixedHighlights = [
    { id: 1, type: "overtime", user_name: "A", date: "2024-06-03", details: "", status: "pending" },
    { id: 2, type: "standby", user_name: "B", date: "2024-06-01", details: "", status: "pending" },
    { id: 3, type: "leave", user_name: "C", date: "2024-06-02", details: "", status: "pending" },
    { id: 4, type: "leave", user_name: "D", date: "2024-06-05", details: "", status: "approved" },
  ];

  it("computes highlightTypeCounts from pending items only", () => {
    const { result } = renderHook(() =>
      useTeamLeaderDashboardUI({ teamStats: null, queueHighlights: mixedHighlights } as any)
    );
    expect(result.current.highlightTypeCounts).toEqual({
      all: 3,
      overtime: 1,
      standby: 1,
      leave: 1,
    });
  });

  it("filters and sorts highlights by type and date", () => {
    const { result } = renderHook(() =>
      useTeamLeaderDashboardUI({ teamStats: null, queueHighlights: mixedHighlights } as any, {
        highlightFilter: "all",
        highlightSort: "recent",
      })
    );
    expect(result.current.filteredSortedHighlights.map((h) => h.id)).toEqual([4, 1, 3, 2]);
  });

  it("filters highlights down to a single type", () => {
    const { result } = renderHook(() =>
      useTeamLeaderDashboardUI({ teamStats: null, queueHighlights: mixedHighlights } as any, {
        highlightFilter: "leave",
        highlightSort: "oldest",
      })
    );
    expect(result.current.filteredSortedHighlights.map((h) => h.id)).toEqual([3, 4]);
  });
});
