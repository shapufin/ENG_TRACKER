import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useCalendarManagementPage } from "./useCalendarManagementPage";

vi.mock("@/hooks/useCalendarManagement", () => ({
  useCalendarManagement: () => ({
    teams: [],
    calendarGroups: [],
    groupStats: {},
    holidays: [],
    workspaces: [],
    isLoading: false,
    holidaysLoading: false,
    updateTeamMutation: { mutate: vi.fn() },
    bulkUpdateMutation: { mutate: vi.fn() },
    renameGroupMutation: { mutate: vi.fn() },
    clearGroupMutation: { mutate: vi.fn() },
    holidayMutation: { mutate: vi.fn() },
    deleteHolidayMutation: { mutate: vi.fn() },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children);

describe("useCalendarManagementPage", () => {
  it("initializes state and opens forms", () => {
    const { result } = renderHook(() => useCalendarManagementPage(), { wrapper });
    expect(result.current.activeTab).toBe("team-groups");
    act(() => {
      result.current.setActiveTab("holidays");
    });
    expect(result.current.activeTab).toBe("holidays");
  });

  it("opens holiday form", () => {
    const { result } = renderHook(() => useCalendarManagementPage(), { wrapper });
    act(() => {
      result.current.openHolidayForm();
    });
    expect(result.current.holidayFormOpen).toBe(true);
    expect(result.current.editingHoliday).toBeNull();
  });

  it("handles bulk apply intent", () => {
    const { result } = renderHook(() => useCalendarManagementPage(), { wrapper });
    act(() => {
      result.current.setSelectedTeams(new Set([1]));
      result.current.setBulkGroup("G");
    });
    act(() => {
      result.current.handleBulkApplyIntent();
    });
    expect(result.current.bulkConfirmOpen).toBe(true);
    expect(result.current.pendingBulkGroup).toBe("G");
  });

  it("confirms bulk update", () => {
    const { result } = renderHook(() => useCalendarManagementPage(), { wrapper });
    act(() => {
      result.current.setSelectedTeams(new Set([1]));
      result.current.setBulkGroup("G");
    });
    act(() => {
      result.current.handleBulkApplyIntent();
    });
    act(() => {
      result.current.confirmBulkUpdate();
    });
    expect(result.current.bulkConfirmOpen).toBe(false);
  });

  it("validates holiday submit", () => {
    const { result } = renderHook(() => useCalendarManagementPage(), { wrapper });
    const e = { preventDefault: vi.fn() } as any;
    act(() => {
      result.current.handleHolidaySubmit(e);
    });
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
