import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useAdminDashboardQueries,
  useAdminOverview,
  useAdminPeople,
  useAdminTrends,
} from "./useAdminDashboardQueries";

vi.mock("@/services/dashboardService", () => ({
  dashboardService: {
    getAdminOverview: vi.fn().mockResolvedValue({}),
    getAdminTrends: vi.fn().mockResolvedValue({}),
    getAdminPeople: vi.fn().mockResolvedValue({}),
    getHRStats: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/services/auditLogService", () => ({
  auditLogService: { getRecentLogs: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/hooks/usePluginPermissions", () => ({
  usePluginPermissions: () => ({ canView: () => false }),
}));

describe("admin dashboard queries", () => {
  it("refetch when the tab regains focus and go stale within a minute", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(
      () => {
        useAdminOverview(true);
        useAdminTrends(true);
        useAdminPeople(true);
        return useAdminDashboardQueries();
      },
      { wrapper }
    );
    const figures = () =>
      qc
        .getQueryCache()
        .getAll()
        .filter((q) => q.queryKey[1] !== "audit-logs");
    await waitFor(() => expect(figures()).toHaveLength(4));

    for (const query of figures()) {
      const options = query.options as { staleTime?: number; refetchOnWindowFocus?: boolean };
      expect(options.refetchOnWindowFocus, String(query.queryKey)).toBe(true);
      expect(options.staleTime, String(query.queryKey)).toBe(60_000);
    }
  });
});
