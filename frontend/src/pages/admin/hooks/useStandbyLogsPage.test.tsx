import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { useStandbyLogsPage } from "./useStandbyLogsPage";

const reject = vi.fn().mockResolvedValue({});

vi.mock("@/services/standbyService", () => ({
  standbyService: {
    getAdminLogs: vi.fn().mockResolvedValue({
      count: 0,
      results: [],
      status_counts: { total: 0, pending: 0, approved: 0, rejected: 0 },
    }),
    reject: (...args: unknown[]) => reject(...args),
    approve: vi.fn(),
    deleteLog: vi.fn(),
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
);

afterEach(() => vi.restoreAllMocks());

describe("useStandbyLogsPage rejection", () => {
  it("opens the reason dialog instead of a browser prompt, and rejects with the typed reason", async () => {
    const promptSpy = vi.spyOn(window, "prompt");
    const { result } = renderHook(() => useStandbyLogsPage(), { wrapper });

    act(() => result.current.handleSingleReject(7));
    expect(promptSpy).not.toHaveBeenCalled();
    expect(result.current.rejectionDialogOpen).toBe(true);

    await act(async () => result.current.handleRejectionConfirm("Not on call"));
    expect(reject).toHaveBeenCalledWith(7, "Not on call");
  });
});
