import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTeamManagement } from "./useTeamManagement";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getTeamLogs: vi.fn(), approve: vi.fn(), reject: vi.fn() },
}));
vi.mock("@/services/standbyService", () => ({
  standbyService: { getTeamLogs: vi.fn(), approve: vi.fn(), reject: vi.fn() },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getTeamLogs: vi.fn(),
    getTeamBalances: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  },
}));
vi.mock("@/services/userService", () => ({
  userService: { getMyTeamMembers: vi.fn() },
}));
vi.mock("./useInvalidateVacationData", () => ({ useInvalidateVacationData: () => vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useTeamManagement", () => {
  it("loads data and exposes mutations", async () => {
    vi.mocked(overtimeService.getTeamLogs).mockResolvedValue({ results: [{ id: 1 }] } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [{ id: 2 }] } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [{ id: 3 }] } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([{ id: 4 }] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([{ id: 5 }] as any);

    const { result } = renderHook(() => useTeamManagement(), { wrapper });
    await waitFor(() => expect(result.current.overtimeLogs.length).toBe(1));
    expect(result.current.standbyLogs.length).toBe(1);
    expect(result.current.leaveRequests.length).toBe(1);
    expect(result.current.teamMembers.length).toBe(1);
    expect(result.current.teamBalances.length).toBe(1);
  });

  it("calls all mutations", async () => {
    vi.mocked(overtimeService.getTeamLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [] } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([] as any);

    const { result } = renderHook(() => useTeamManagement(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    result.current.otApproveMutation.mutate(1);
    result.current.otRejectMutation.mutate({ id: 1, reason: "no" });
    result.current.sbApproveMutation.mutate(1);
    result.current.sbRejectMutation.mutate({ id: 1, reason: "no" });
    result.current.leaveApproveMutation.mutate(1);
    result.current.leaveRejectMutation.mutate({ id: 1, reason: "no" });
    await waitFor(() => expect(overtimeService.approve).toHaveBeenCalled());
    expect(overtimeService.reject).toHaveBeenCalled();
    expect(standbyService.approve).toHaveBeenCalled();
    expect(standbyService.reject).toHaveBeenCalled();
    expect(leaveService.approve).toHaveBeenCalled();
    expect(leaveService.reject).toHaveBeenCalled();
  });

  it("fetches all pages when next is non-null instead of truncating at page 1", async () => {
    vi.mocked(overtimeService.getTeamLogs)
      .mockResolvedValueOnce({
        results: [{ id: 1 }, { id: 2 }],
        next: "http://api/overtime/logs/team_logs/?page=2",
        count: 3,
      } as any)
      .mockResolvedValueOnce({
        results: [{ id: 3 }],
        next: null,
        count: 3,
      } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([] as any);

    const { result } = renderHook(() => useTeamManagement(), { wrapper });
    await waitFor(() => expect(result.current.overtimeLogs).toHaveLength(3));
    expect(result.current.overtimeLogs.map((r: any) => r.id)).toEqual([1, 2, 3]);
  });

  it("fetches with page_size 5000", async () => {
    vi.mocked(overtimeService.getTeamLogs).mockClear();
    vi.mocked(overtimeService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([] as any);

    const { result } = renderHook(() => useTeamManagement(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(overtimeService.getTeamLogs).toHaveBeenCalledWith(
      expect.objectContaining({ page_size: 5000 })
    );
  });

  it("does not refetch on remount within 30 seconds", async () => {
    vi.mocked(overtimeService.getTeamLogs).mockClear();
    vi.mocked(standbyService.getTeamLogs).mockClear();
    vi.mocked(leaveService.getTeamLogs).mockClear();
    vi.mocked(leaveService.getTeamBalances).mockClear();
    vi.mocked(userService.getMyTeamMembers).mockClear();
    vi.mocked(overtimeService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(standbyService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamLogs).mockResolvedValue({ results: [], next: null } as any);
    vi.mocked(leaveService.getTeamBalances).mockResolvedValue([] as any);
    vi.mocked(userService.getMyTeamMembers).mockResolvedValue([] as any);

    const sharedClient = new QueryClient();
    const sharedWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={sharedClient}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useTeamManagement(), { wrapper: sharedWrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    const second = renderHook(() => useTeamManagement(), { wrapper: sharedWrapper });
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(overtimeService.getTeamLogs).toHaveBeenCalledTimes(1);
    expect(standbyService.getTeamLogs).toHaveBeenCalledTimes(1);
    expect(leaveService.getTeamLogs).toHaveBeenCalledTimes(1);
    expect(leaveService.getTeamBalances).toHaveBeenCalledTimes(1);
    expect(userService.getMyTeamMembers).toHaveBeenCalledTimes(1);
  });
});
