import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHRTeamLeaderAssignment } from "./useHRTeamLeaderAssignment";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getProfiles: vi.fn(),
    getTechFacets: vi.fn(),
    getItalianTeamLeaders: vi.fn(),
    getAlbanianTeamLeaders: vi.fn(),
    setTeamLeader: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("useHRTeamLeaderAssignment", () => {
  beforeEach(() => {
    vi.mocked(userService.getProfiles).mockResolvedValue({
      results: [{ id: 1 }],
      count: 1,
    } as any);
    vi.mocked(userService.getTechFacets).mockResolvedValue({
      techs: [{ id: 1, name: "K8s", count: 1 }],
      no_tech_count: 2,
    } as any);
    vi.mocked(userService.getItalianTeamLeaders).mockResolvedValue([
      { id: 5, full_name: "Dave TL" },
    ] as any);
    vi.mocked(userService.getAlbanianTeamLeaders).mockResolvedValue([
      { id: 6, full_name: "Eve TL" },
    ] as any);
  });

  it("loads profiles, tech facets, and TL lists", async () => {
    const { result } = renderHook(() => useHRTeamLeaderAssignment(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profiles).toEqual([{ id: 1 }]);
    expect(result.current.techFacets).toEqual([{ id: 1, name: "K8s", count: 1 }]);
    expect(result.current.noTechCount).toBe(2);
    expect(result.current.italianTLs).toEqual([{ id: 5, full_name: "Dave TL" }]);
    expect(result.current.albanianTLs).toEqual([{ id: 6, full_name: "Eve TL" }]);
  });

  it("selecting 'No tech' clears any selected tech and tech-level ids", async () => {
    const { result } = renderHook(() => useHRTeamLeaderAssignment(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setTechIds([1, 2]));
    act(() => result.current.setTechLevelIds([9]));
    expect(result.current.techIds).toEqual([1, 2]);
    expect(result.current.techLevelIds).toEqual([9]);

    act(() => result.current.setNoTechOnly(true));

    expect(result.current.noTechOnly).toBe(true);
    expect(result.current.techIds).toEqual([]);
    expect(result.current.techLevelIds).toEqual([]);
  });

  it("selecting a tech id clears noTechOnly", async () => {
    const { result } = renderHook(() => useHRTeamLeaderAssignment(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setNoTechOnly(true));
    expect(result.current.noTechOnly).toBe(true);

    act(() => result.current.setTechIds([3]));

    expect(result.current.noTechOnly).toBe(false);
    expect(result.current.techIds).toEqual([3]);
  });

  it("setTeamLeader calls the service and invalidates the page's own query key on success", async () => {
    vi.mocked(userService.setTeamLeader).mockResolvedValue({} as any);
    const { result } = renderHook(() => useHRTeamLeaderAssignment(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setTeamLeader({ profileId: 1, role: "italian_tl", teamLeaderUserId: 5 });
    });

    await waitFor(() => expect(userService.setTeamLeader).toHaveBeenCalledWith(1, "italian_tl", 5));
  });

  it("bulk set fires one service call per profile but exactly one success toast", async () => {
    const { toast } = await import("sonner");
    vi.mocked(userService.setTeamLeader).mockClear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(userService.setTeamLeader).mockResolvedValue({} as any);
    const { result } = renderHook(() => useHRTeamLeaderAssignment(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.setTeamLeaderBulkAsync([
        { profileId: 1, role: "italian_tl", teamLeaderUserId: 5 },
        { profileId: 2, role: "italian_tl", teamLeaderUserId: 5 },
      ]);
    });

    expect(userService.setTeamLeader).toHaveBeenCalledTimes(2);
    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Italian TL updated for 2 users");
  });
});
