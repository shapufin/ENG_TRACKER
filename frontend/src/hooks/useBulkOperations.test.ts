import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useBulkOperations } from "./useBulkOperations";
import { useAdminRejectMutation } from "./useAdminRejectMutation";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

const DASHBOARD = { queryKey: ["dashboard"] };
const client = () => {
  const queryClient = new QueryClient();
  return { queryClient, spy: vi.spyOn(queryClient, "invalidateQueries") };
};

describe("dashboard refresh after request mutations", () => {
  it.each(["bulkApproveMutation", "bulkDeleteMutation"] as const)("%s", async (name) => {
    const { queryClient, spy } = client();
    const done = vi.fn().mockResolvedValue({ approved_count: 1, deleted_count: 1 });
    const { result } = renderHook(
      () => useBulkOperations({ queryKey: ["team"], approveFn: done, deleteFn: done }),
      { wrapper: createWrapper(queryClient) }
    );
    await result.current[name].mutateAsync([1]);
    expect(spy).toHaveBeenCalledWith(DASHBOARD);
  });

  it("admin rejection", async () => {
    const { queryClient, spy } = client();
    const { result } = renderHook(() => useAdminRejectMutation(vi.fn().mockResolvedValue({})), {
      wrapper: createWrapper(queryClient),
    });
    await result.current.mutateAsync({ id: 1, reason: "No" });
    expect(spy).toHaveBeenCalledWith(DASHBOARD);
  });
});
