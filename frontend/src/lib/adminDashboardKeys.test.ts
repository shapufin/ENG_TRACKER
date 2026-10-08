import { describe, it, expect, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { ADMIN_DASHBOARD_QUERY_KEYS, invalidateAdminDashboard } from "./adminDashboardKeys";

describe("invalidateAdminDashboard", () => {
  it("invalidates exactly the dashboard keys, never the bare admin prefix", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateAdminDashboard({ invalidateQueries } as unknown as QueryClient);
    const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
    expect(keys).toEqual([...ADMIN_DASHBOARD_QUERY_KEYS]);
    expect(keys).toContainEqual(["admin", "overview"]);
    expect(keys).toContainEqual(["admin", "trends"]);
    expect(keys).toContainEqual(["admin", "people"]);
    expect(keys).toContainEqual(["admin", "global-stats"]);
    expect(keys).not.toContainEqual(["admin"]);
    expect(keys).not.toContainEqual(["admin", "overtime", "admin_logs"]);
  });

  it("only refetches active queries", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    await invalidateAdminDashboard({ invalidateQueries } as unknown as QueryClient);
    for (const [arg] of invalidateQueries.mock.calls) expect(arg.refetchType).toBe("active");
  });
});
