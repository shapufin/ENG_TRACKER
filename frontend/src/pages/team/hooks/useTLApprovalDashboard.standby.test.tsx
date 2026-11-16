import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StandbyLog } from "@/types";

const bulkApprove = vi.fn();
const bulkReject = vi.fn();
const approve = vi.fn();
const reject = vi.fn();

const log = (id: number, date: string, status = "pending", user = 1) =>
  ({
    id,
    user,
    date,
    hours: "6.00",
    start_time: "18:00:00",
    end_time: "00:00:00",
    status,
  }) as unknown as StandbyLog;

// Two shifts on 17/11 (ids 2 and 3), one single shift on 18/11 (id 4).
const standby = [log(2, "2026-11-17"), log(3, "2026-11-17"), log(4, "2026-11-18")];

vi.mock("@/hooks/useTeamPendingQueries", () => ({
  useTeamPendingQueries: () => ({
    overtime: { data: [], isLoading: false, error: null, refetch: vi.fn() },
    standby: { data: standby, isLoading: false, error: null, refetch: vi.fn() },
    leave: { data: [], isLoading: false, error: null, refetch: vi.fn() },
  }),
}));
vi.mock("@/hooks/usePendingMonths", () => ({
  usePendingMonths: () => ({ overtime: [], standby: [], leave: [] }),
}));
vi.mock("@/hooks/useApprovalMutations", () => ({
  useApprovalMutations: () => ({
    approveMutation: { mutate: approve },
    rejectMutation: { mutate: reject },
  }),
}));
vi.mock("./useTLBulkMutations", () => ({
  useTLBulkMutations: () => ({
    bulkApproveMutation: { mutate: bulkApprove, isPending: false },
    bulkRejectMutation: { mutate: bulkReject, isPending: false },
  }),
}));
vi.mock("@/hooks/useInvalidateVacationData", () => ({
  useInvalidateVacationData: () => vi.fn(),
}));

import { useTLApprovalDashboard } from "./useTLApprovalDashboard";

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTLApprovalDashboard(true), { wrapper });
};

describe("approvals queue, bundled standby days", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows one row per person-day but keeps counting records", () => {
    const { result } = setup();
    expect(result.current.tabData.standby).toHaveLength(2);
    expect(result.current.queries.standby.data).toHaveLength(3);
  });

  it("a selected bundled row stands for every pending shift of the day", () => {
    const { result } = setup();
    act(() => result.current.handleRowSelectionChange("standby")({ "0": true }));
    expect(result.current.getSelectedIds("standby", result.current.tabData.standby)).toEqual([
      2, 3,
    ]);
  });

  it("approves every shift of a bundled day with one bulk call", () => {
    const { result } = setup();
    act(() => result.current.handleApprove("standby", 2));
    expect(bulkApprove).toHaveBeenCalledWith({ type: "standby", ids: [2, 3] });
    expect(approve).not.toHaveBeenCalled();
  });

  it("approves a single-shift day the usual way", () => {
    const { result } = setup();
    act(() => result.current.handleApprove("standby", 4));
    expect(approve).toHaveBeenCalledWith({ type: "standby", id: 4 });
    expect(bulkApprove).not.toHaveBeenCalled();
  });

  it("rejects every shift of a bundled day with the reason", () => {
    const { result } = setup();
    act(() => result.current.handleReject(2, "standby"));
    act(() => result.current.setRejectReason("no"));
    act(() => result.current.confirmReject());
    expect(bulkReject).toHaveBeenCalledWith({ type: "standby", ids: [2, 3], reason: "no" });
    expect(reject).not.toHaveBeenCalled();
  });
});
