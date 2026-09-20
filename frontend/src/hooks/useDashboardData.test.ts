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
  leaveService: { getRequests: vi.fn(), getUserBalanceSummary: vi.fn() },
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
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 20,
      next: null,
      previous: null,
      results: [{ hours: 1 }, { hours: 1 }, { hours: 1 }, { hours: 1 }, { hours: 1 }],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 42,
      total_entries: 20,
      approved_hours: 42,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(leaveService.getUserBalanceSummary).mockResolvedValue({} as never);
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

  it("vacationBalanceDays reflects the real remaining balance, not a page-capped sum of approved requests", async () => {
    vi.mocked(overtimeService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(leaveService.getUserBalanceSummary).mockResolvedValue({
      user_id: 1,
      username: "u",
      full_name: "U",
      year: 2026,
      vacation: {
        carry_over: null,
        current_year: null,
        total_available: 17,
        total_used: 3,
        total_pending: 0,
      },
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

    await waitFor(() => expect(result.current.vacationBalanceDays).toBe(17));
  });

  it("weekOvertimeLogs/weekStandbyLogs come from a dedicated date-ranged query, not the page_size-capped recent list", async () => {
    // The "recent activity" list is capped at page_size 5 and would silently
    // undercount a week with more logs than that. The weekly hours chart
    // must read from a separate, larger date-ranged fetch instead.
    vi.mocked(overtimeService.getLogs).mockImplementation(
      (params) =>
        Promise.resolve(
          params?.page_size === 100
            ? {
                count: 6,
                next: null,
                previous: null,
                results: Array.from({ length: 6 }, (_, i) => ({
                  date: "2026-09-14",
                  hours: i + 1,
                })),
              }
            : { count: 6, next: null, previous: null, results: [{ date: "2026-09-14", hours: 1 }] }
        ) as never
    );
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 21,
      total_entries: 6,
      approved_hours: 21,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(leaveService.getUserBalanceSummary).mockResolvedValue({} as never);
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

    await waitFor(() => expect(result.current.weekOvertimeLogs).toHaveLength(6));
  });

  it("does not fire the weekly date-ranged queries on non-personal dashboards", async () => {
    vi.mocked(overtimeService.getLogs).mockClear();
    vi.mocked(standbyService.getLogs).mockClear();
    vi.mocked(overtimeService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(leaveService.getUserBalanceSummary).mockResolvedValue({} as never);
    vi.mocked(dashboardService.getHRStats).mockResolvedValue({} as never);

    const queryClient = new QueryClient();
    renderHook(
      () =>
        useDashboardData({
          userId: 1,
          isAdmin: false,
          isHR: true,
          selectedDashboard: "hr",
        }),
      { wrapper: createWrapper(queryClient) }
    );

    // Let any would-be queries settle, then assert the weekly fetch never ran.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const weeklyCalls = vi
      .mocked(overtimeService.getLogs)
      .mock.calls.filter((args) => (args[0] as { page_size?: number })?.page_size === 100);
    expect(weeklyCalls).toHaveLength(0);
  });

  it("shifts the weekly window back a full week per weekOffset with real ranges", async () => {
    vi.mocked(overtimeService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(overtimeService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(standbyService.getLogs).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(standbyService.getSummary).mockResolvedValue({
      total_hours: 0,
      total_entries: 0,
      approved_hours: 0,
      pending_hours: 0,
      rejected_hours: 0,
    });
    vi.mocked(leaveService.getRequests).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    } as never);
    vi.mocked(leaveService.getUserBalanceSummary).mockResolvedValue({
      user_id: 1,
      username: "u",
      full_name: "U",
      year: 2026,
      vacation: {
        carry_over: null,
        current_year: null,
        total_available: 9,
        total_used: 11,
        total_pending: 0,
      },
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
          weekOffset: 1,
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.weekReferenceDate).toBeDefined());
    // The balance summary resolves on its own query — wait for it too.
    await waitFor(() => expect(result.current.leaveUsedDays).toBe(11));
    // Local-date formatting, mirroring the hook (UTC slicing would flake
    // across midnight in non-UTC timezones).
    const toLocalISO = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const end = new Date();
    end.setDate(end.getDate() - 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const weeklyCall = vi
      .mocked(overtimeService.getLogs)
      .mock.calls.find((args) => (args[0] as { page_size?: number })?.page_size === 100);
    expect(weeklyCall?.[0]).toMatchObject({
      date_from: toLocalISO(start),
      date_to: toLocalISO(end),
    });
    expect(result.current.weekReferenceDate).toBe(toLocalISO(end));
    expect(result.current.leaveAvailableDays).toBe(9);
  });
});
