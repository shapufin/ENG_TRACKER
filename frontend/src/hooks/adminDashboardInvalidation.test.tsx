import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAdminRejectMutation } from "./useAdminRejectMutation";
import { useLeaveBalances } from "./useLeaveBalances";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));
vi.mock("@/services/userService", () => ({
  userService: { getUsers: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/services/leaveService", () => ({
  leaveService: {
    getBalances: vi.fn().mockResolvedValue([]),
    createBalance: vi.fn().mockResolvedValue({}),
    updateBalance: vi.fn().mockResolvedValue({}),
    deleteBalance: vi.fn().mockResolvedValue({}),
  },
}));

const DASHBOARD_KEYS = [
  ["admin", "overview"],
  ["admin", "trends"],
  ["admin", "people"],
  ["admin", "global-stats"],
];

let qc: QueryClient;
let spy: ReturnType<typeof vi.spyOn>;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
const invalidatedKeys = () => spy.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  spy = vi.spyOn(qc, "invalidateQueries");
});

describe("admin dashboard stays fresh after admin actions", () => {
  it("rejecting a request invalidates the dashboard keys", async () => {
    const { result } = renderHook(() => useAdminRejectMutation(vi.fn().mockResolvedValue({})), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, reason: "no" });
    });
    for (const key of DASHBOARD_KEYS) expect(invalidatedKeys()).toContainEqual(key);
  });

  it("deleting a leave balance invalidates the dashboard keys", async () => {
    const { result } = renderHook(() => useLeaveBalances(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.deleteMutation.mutateAsync(5);
    });
    for (const key of DASHBOARD_KEYS) expect(invalidatedKeys()).toContainEqual(key);
    expect(invalidatedKeys()).toContainEqual(["admin", "balances"]);
  });
});
