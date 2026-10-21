import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useReportsPage } from "./useReportsPage";
import { reportService } from "@/services/reportService";

vi.mock("@/hooks/useValidWorkspaceIds", () => ({
  useValidWorkspaceIds: () => ({ validIds: [] }),
}));
vi.mock("@/services/userService", () => ({
  userService: { getTeams: vi.fn().mockResolvedValue({ results: [] }) },
}));
vi.mock("@/services/reportService", () => ({
  reportService: { getSummary: vi.fn(), getDetailed: vi.fn(), exportExcel: vi.fn() },
}));

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("useReportsPage.generateForRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportService.getSummary).mockResolvedValue({} as never);
    vi.mocked(reportService.getDetailed).mockResolvedValue({} as never);
  });

  it("generates with the new range, not the previous dates", async () => {
    const { result } = renderHook(() => useReportsPage(), { wrapper });

    act(() => result.current.generateForRange({ start: "2026-10-01", end: "2026-10-31" }));

    await waitFor(() => expect(reportService.getSummary).toHaveBeenCalled());
    expect(reportService.getSummary).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: "2026-10-01", end_date: "2026-10-31" })
    );
    expect(reportService.getDetailed).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: "2026-10-01", end_date: "2026-10-31" })
    );
  });
});
