import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePendingApprovalCount } from "./usePendingApprovalCount";
import { overtimeService } from "@/services/overtimeService";
import { standbyService } from "@/services/standbyService";
import { leaveService } from "@/services/leaveService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { getTeamPendingMonths: vi.fn() },
}));
vi.mock("@/services/standbyService", () => ({
  standbyService: { getTeamPendingMonths: vi.fn() },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: { getTeamPendingMonths: vi.fn() },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("usePendingApprovalCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("sums pending counts across overtime, standby, and leave", async () => {
    vi.mocked(overtimeService.getTeamPendingMonths).mockResolvedValue([
      { month: "2026-09-01", count: 2 },
    ] as any);
    vi.mocked(standbyService.getTeamPendingMonths).mockResolvedValue([
      { month: "2026-09-01", count: 3 },
    ] as any);
    vi.mocked(leaveService.getTeamPendingMonths).mockResolvedValue([
      { month: "2026-08-01", count: 1 },
      { month: "2026-09-01", count: 4 },
    ] as any);
    const { result } = renderHook(() => usePendingApprovalCount(true), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(10));
  });

  it("returns 0 and fetches nothing when team management is off", () => {
    const { result } = renderHook(() => usePendingApprovalCount(false), { wrapper });
    expect(result.current.total).toBe(0);
    expect(overtimeService.getTeamPendingMonths).not.toHaveBeenCalled();
    expect(standbyService.getTeamPendingMonths).not.toHaveBeenCalled();
    expect(leaveService.getTeamPendingMonths).not.toHaveBeenCalled();
  });
});
