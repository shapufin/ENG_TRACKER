import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useReportManagement } from "./useReportManagement";

const svc = vi.hoisted(() => ({
  getSummary: vi.fn().mockResolvedValue({}),
  getDetailed: vi.fn().mockResolvedValue({ users: [] }),
}));
vi.mock("@/services/reportService", () => ({ reportService: svc }));
vi.mock("@/services/userService", () => ({
  userService: { getTeams: vi.fn().mockResolvedValue({ results: [] }) },
}));

const setup = (selectedTeam: string) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useReportManagement({
        start_date: "2026-10-01",
        end_date: "2026-10-31",
        activeTab: "overtime_standby",
        groupBy: "user",
        selectedTeam,
      }),
    { wrapper }
  );
  return { client, hook };
};

describe("useReportManagement team filter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends team_ids and keys the queries by team", async () => {
    const { client, hook } = setup("7");
    await act(async () => {
      await hook.result.current.onGenerate();
    });
    expect(svc.getSummary).toHaveBeenCalledWith(expect.objectContaining({ team_ids: "7" }));
    expect(svc.getDetailed).toHaveBeenCalledWith(expect.objectContaining({ team_ids: "7" }));
    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys.filter((k) => k.includes('"reports"') && k.includes('"7"'))).toHaveLength(2);
  });

  it("omits team_ids for all teams", async () => {
    const { hook } = setup("all");
    await act(async () => {
      await hook.result.current.onGenerate();
    });
    expect(svc.getSummary.mock.calls[0][0].team_ids).toBeUndefined();
  });
});
