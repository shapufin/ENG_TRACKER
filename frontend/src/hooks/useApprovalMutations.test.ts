import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useApprovalMutations } from "./useApprovalMutations";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: {
    approve: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock("@/services/standbyService", () => ({ standbyService: {} }));
vi.mock("@/services/leaveService", () => ({ leaveService: {} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

const setup = () => {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const { result } = renderHook(
    () =>
      useApprovalMutations({
        invalidateVacationData: vi.fn(),
        refetchMap: { overtime: vi.fn(), standby: vi.fn(), leave: vi.fn() },
      }),
    { wrapper: createWrapper(queryClient) }
  );
  return { result, invalidateQueries };
};

describe("useApprovalMutations", () => {
  it("refreshes the dashboard after an approval", async () => {
    const { result, invalidateQueries } = setup();
    await result.current.approveMutation.mutateAsync({ type: "overtime", id: 1 });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("refreshes the dashboard after a rejection", async () => {
    const { result, invalidateQueries } = setup();
    await result.current.rejectMutation.mutateAsync({ type: "overtime", id: 1, reason: "No" });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });
});
