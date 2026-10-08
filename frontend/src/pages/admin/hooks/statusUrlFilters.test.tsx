import { describe, it, expect } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useHoursLogsFilterState } from "./hoursLogsFilter";
import { useLeaveRequestFilters } from "./useLeaveRequestFilters";

const wrap =
  (url: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );

describe("useHoursLogsFilterState status deep link", () => {
  it("starts on the status from ?status=", () => {
    const { result } = renderHook(() => useHoursLogsFilterState(), {
      wrapper: wrap("/admin/overtime-logs?status=pending"),
    });
    expect(result.current.filterStatus).toBe("pending");
  });

  it("ignores a bogus status", () => {
    const { result } = renderHook(() => useHoursLogsFilterState(), {
      wrapper: wrap("/admin/overtime-logs?status=bogus"),
    });
    expect(result.current.filterStatus).toBe("all");
  });

  it("writes the status to the URL when changed", () => {
    const { result } = renderHook(
      () => ({ f: useHoursLogsFilterState(), loc: useLocation() }),
      { wrapper: wrap("/admin/overtime-logs") }
    );
    act(() => result.current.f.setFilterStatus("approved"));
    expect(result.current.loc.search).toBe("?status=approved");
    expect(result.current.f.filterStatus).toBe("approved");
  });
});

describe("useLeaveRequestFilters status deep link", () => {
  it("starts on the status from ?status=", () => {
    const { result } = renderHook(() => useLeaveRequestFilters([]), {
      wrapper: wrap("/admin/leave-requests?status=pending"),
    });
    expect(result.current.filterStatus).toBe("pending");
  });

  it("ignores a bogus status and updates the URL on change", () => {
    const { result } = renderHook(
      () => ({ f: useLeaveRequestFilters([]), loc: useLocation() }),
      { wrapper: wrap("/admin/leave-requests?status=nope") }
    );
    expect(result.current.f.filterStatus).toBe("all");
    act(() => result.current.f.setFilterStatus("rejected"));
    expect(result.current.loc.search).toBe("?status=rejected");
  });
});
