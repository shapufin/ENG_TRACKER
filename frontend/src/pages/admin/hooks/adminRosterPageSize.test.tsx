import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useLeaveBalances } from "@/hooks/useLeaveBalances";
import { useTeamsPageData } from "./useTeamsPageData";
import { leaveService } from "@/services/leaveService";
import { userService } from "@/services/userService";

vi.mock("@/services/leaveService", () => ({
  leaveService: { getBalances: vi.fn().mockResolvedValue([]), createBalance: vi.fn() },
}));
vi.mock("@/services/userService", () => ({
  userService: {
    getTeams: vi.fn().mockResolvedValue({ count: 0, results: [] }),
    getCalendarGroups: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue({ results: [] }),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("admin roster pages load the whole list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("balances page requests a full page", async () => {
    renderHook(() => useLeaveBalances(), { wrapper });
    await waitFor(() => expect(leaveService.getBalances).toHaveBeenCalledWith({ page_size: 1000 }));
  });

  it("teams page requests a full page", async () => {
    renderHook(() => useTeamsPageData(), { wrapper });
    await waitFor(() =>
      expect(userService.getTeams).toHaveBeenCalledWith({ page_size: 1000, is_active: "all" })
    );
  });
});
