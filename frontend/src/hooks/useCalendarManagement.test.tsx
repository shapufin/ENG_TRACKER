import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCalendarManagement } from "./useCalendarManagement";
import { userService } from "@/services/userService";
import { calendarAdminService } from "@/services/calendarAdminService";

vi.mock("@/services/userService", () => ({
  userService: {
    getTeams: vi.fn(),
    getCalendarGroups: vi.fn(),
    getCalendarGroupStats: vi.fn(),
    updateTeam: vi.fn(),
    bulkUpdateCalendarGroup: vi.fn(),
    renameCalendarGroup: vi.fn(),
    clearCalendarGroup: vi.fn(),
  },
}));

vi.mock("@/services/calendarAdminService", () => ({
  calendarAdminService: {
    listHolidays: vi.fn(),
    listWorkspaces: vi.fn(),
    updateHoliday: vi.fn(),
    createHoliday: vi.fn(),
    deleteHoliday: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useCalendarManagement", () => {
  it("loads data and exposes mutations", async () => {
    vi.mocked(userService.getTeams).mockResolvedValue({ results: [{ id: 1 }] } as any);
    vi.mocked(userService.getCalendarGroups).mockResolvedValue([] as any);
    vi.mocked(userService.getCalendarGroupStats).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listHolidays).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listWorkspaces).mockResolvedValue([] as any);

    const { result } = renderHook(() => useCalendarManagement(), { wrapper });
    await waitFor(() => expect(result.current.teams.length).toBe(1));
    expect(result.current.holidays).toEqual([]);
    expect(result.current.updateTeamMutation).toBeDefined();
  });

  it("calls updateTeam mutation", async () => {
    vi.mocked(userService.getTeams).mockResolvedValue({ results: [] } as any);
    vi.mocked(userService.getCalendarGroups).mockResolvedValue([] as any);
    vi.mocked(userService.getCalendarGroupStats).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listHolidays).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listWorkspaces).mockResolvedValue([] as any);
    vi.mocked(userService.updateTeam).mockResolvedValue({} as any);

    const { result } = renderHook(() => useCalendarManagement(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.updateTeamMutation.mutate({ id: 1, payload: {} });
    await waitFor(() => expect(userService.updateTeam).toHaveBeenCalled());
  });

  it("calls holiday mutation with id update", async () => {
    vi.mocked(userService.getTeams).mockResolvedValue({ results: [] } as any);
    vi.mocked(userService.getCalendarGroups).mockResolvedValue([] as any);
    vi.mocked(userService.getCalendarGroupStats).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listHolidays).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listWorkspaces).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.updateHoliday).mockResolvedValue({} as any);

    const { result } = renderHook(() => useCalendarManagement(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.holidayMutation.mutate({ id: 1, payload: { name: "X", date: "2024-01-01" } });
    await waitFor(() => expect(calendarAdminService.updateHoliday).toHaveBeenCalled());
  });

  it("calls bulk, rename, clear, and delete mutations", async () => {
    vi.mocked(userService.getTeams).mockResolvedValue({ results: [] } as any);
    vi.mocked(userService.getCalendarGroups).mockResolvedValue([] as any);
    vi.mocked(userService.getCalendarGroupStats).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listHolidays).mockResolvedValue([] as any);
    vi.mocked(calendarAdminService.listWorkspaces).mockResolvedValue([] as any);
    vi.mocked(userService.bulkUpdateCalendarGroup).mockResolvedValue({} as any);
    vi.mocked(userService.renameCalendarGroup).mockResolvedValue({} as any);
    vi.mocked(userService.clearCalendarGroup).mockResolvedValue({} as any);
    vi.mocked(calendarAdminService.deleteHoliday).mockResolvedValue({} as any);

    const { result } = renderHook(() => useCalendarManagement(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.bulkUpdateMutation.mutate({ teamIds: [1], calendarGroup: "A" });
    result.current.renameGroupMutation.mutate({ oldName: "A", newName: "B" });
    result.current.clearGroupMutation.mutate("A");
    result.current.deleteHolidayMutation.mutate(1);
    await waitFor(() => {
      expect(userService.bulkUpdateCalendarGroup).toHaveBeenCalled();
      expect(userService.renameCalendarGroup).toHaveBeenCalled();
      expect(userService.clearCalendarGroup).toHaveBeenCalled();
      expect(calendarAdminService.deleteHoliday).toHaveBeenCalled();
    });
  });
});
