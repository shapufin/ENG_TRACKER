import { describe, it, expect } from "vitest";
import { matchesLeaveRequestFilter, sortLeaveRequests } from "./leaveRequestFilterHelpers";
import type { LeaveRequest } from "@/types";

const baseRequest: LeaveRequest = {
  id: 1,
  user: 1,
  user_name: "Alice Smith",
  status: "pending",
  request_type: "vacation",
  start_date: "2024-06-15",
  end_date: "2024-06-20",
  reason: "Family trip",
  created_at: "2024-06-10",
} as LeaveRequest;

describe("matchesLeaveRequestFilter", () => {
  it('matches when all filters are "all"', () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(true);
  });

  it("filters by status", () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "pending",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "approved",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(false);
  });

  it("filters by user", () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "1",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "2",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(false);
  });

  it("filters by type", () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "vacation",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "sick",
        dateFrom: "",
        dateTo: "",
        searchQuery: "",
      })
    ).toBe(false);
  });

  it("filters by date range", () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "2024-06-01",
        dateTo: "2024-06-30",
        searchQuery: "",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "2024-06-21",
        dateTo: "2024-06-30",
        searchQuery: "",
      })
    ).toBe(false);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "2024-06-01",
        dateTo: "2024-06-14",
        searchQuery: "",
      })
    ).toBe(false);
  });

  it("filters by search query", () => {
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "alice",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "family",
      })
    ).toBe(true);
    expect(
      matchesLeaveRequestFilter(baseRequest, {
        filterStatus: "all",
        filterUser: "all",
        filterType: "all",
        dateFrom: "",
        dateTo: "",
        searchQuery: "missing",
      })
    ).toBe(false);
  });
});

describe("sortLeaveRequests", () => {
  it("sorts by created_at descending", () => {
    const a = { ...baseRequest, created_at: "2024-06-10" } as LeaveRequest;
    const b = { ...baseRequest, id: 2, created_at: "2024-06-15" } as LeaveRequest;
    expect(sortLeaveRequests(a, b)).toBeGreaterThan(0);
  });

  it("falls back to start_date when created_at is missing", () => {
    const a = { ...baseRequest, created_at: "", start_date: "2024-06-10" } as LeaveRequest;
    const b = { ...baseRequest, id: 2, created_at: "", start_date: "2024-06-15" } as LeaveRequest;
    expect(sortLeaveRequests(a, b)).toBeGreaterThan(0);
  });
});
