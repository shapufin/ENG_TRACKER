import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useDashboardData } from "./useDashboardData";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";
import { dashboardService } from "@/services/dashboardService";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getLogs: vi.fn(), getSummary: vi.fn() },
}));
vi.mock("@/services/standbyService", () => ({
  standbyService: { getLogs: vi.fn(), getSummary: vi.fn() },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: { getRequests: vi.fn() },
}));
vi.mock("@/services/dashboardService", () => ({
  dashboardService: { getHRStats: vi.fn() },
}));

describe("useDashboardData", () => {
  it("personalStandbyHours reflects the true total, not just the recent-activity page", async () => {
    // Personal dashboards cap the logs list at 5 rows (dashboardPageSize) for
    // the recent-activity feed/chart — with 5 rows summing to 5h but a real
    // total of 42h (more standby entries exist than the page shows), the
    // dashboard tile must show the server aggregate, not the page sum.
    vi.mocked(overtimeService.getLogs).mockResolvedValue({
      count: 0, next: null, previous: null, results: [],
    } as never);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 0, total_entries: 0, approved_hours: 0, pending_hours: 0, rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 20, next: null, previous: null,
      results: [{ hours: 1 }, { hours: 1 }, { hours: 1 }, { hours: 1 }, { hours: 1 }],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 42, total_entries: 20, approved_hours: 42, pending_hours: 0, rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0, next: null, previous: null, results: [],
    } as never);
    vi.mocked(dashboardService.getHRStats).mockResolvedValue({} as never);

    const queryClient = new QueryClient();
    const { result } = renderHook(
      () =>
        useDashboardData({
          userId: 1,
          isAdmin: false,
          isHR: false,
          selectedDashboard: "employee",
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.personalStandbyHours).toBe(42));
  });
});
