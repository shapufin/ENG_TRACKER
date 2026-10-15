import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useUserManagement } from "./useUserManagement";
import { userService } from "@/services/userService";

vi.mock("@/services/userService", () => ({
  userService: {
    getProfiles: vi.fn(),
    getTechFacets: vi.fn(),
    getTeams: vi.fn(),
    getTechs: vi.fn(),
    getItalianTeamLeaders: vi.fn(),
    getAlbanianTeamLeaders: vi.fn(),
    getUserStats: vi.fn(),
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.mocked(userService.getProfiles).mockResolvedValue({
    count: 130,
    next: null,
    previous: null,
    results: [],
  });
  vi.mocked(userService.getTechFacets).mockResolvedValue({ techs: [], no_tech_count: 0 });
  for (const fn of [
    userService.getTeams,
    userService.getTechs,
    userService.getItalianTeamLeaders,
    userService.getAlbanianTeamLeaders,
    userService.getUserStats,
  ]) {
    vi.mocked(fn).mockResolvedValue({ results: [] } as never);
  }
});

describe("useUserManagement server paging", () => {
  it("asks the server for one 50-row page with the search term", async () => {
    const { result } = renderHook(() => useUserManagement({ search: "ann", page: 3 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.profilesCount).toBe(130));
    expect(userService.getProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ search: "ann", page: 3, page_size: 50 })
    );
  });

  it("scopes the tech facet counts by the same search", async () => {
    renderHook(() => useUserManagement({ search: "ann", page: 1 }), { wrapper });
    await waitFor(() =>
      expect(userService.getTechFacets).toHaveBeenCalledWith(
        expect.objectContaining({ search: "ann" })
      )
    );
  });

  it("omits search when blank so the default URL stays clean", async () => {
    renderHook(() => useUserManagement({ search: "", page: 1 }), { wrapper });
    await waitFor(() => expect(userService.getProfiles).toHaveBeenCalled());
    expect(vi.mocked(userService.getProfiles).mock.calls[0][0]).toMatchObject({
      search: undefined,
    });
  });
});
