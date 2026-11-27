import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { useEventActions } from "./useEventActions";
import type { CalendarEvent } from "./types";
import { createWrapper } from "@/test/hookTestUtils";

vi.mock("@/services/leaveService", () => ({
  leaveService: { approve: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/services/standbyService", () => ({ standbyService: {} }));
vi.mock("@/lib/error-handler", () => ({ handleApiError: vi.fn() }));

describe("useEventActions", () => {
  it("refreshes the dashboard after approving from the calendar", async () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const event = { id: "leave-7", type: "vacation" } as CalendarEvent;
    const { result } = renderHook(() => useEventActions(event, vi.fn()), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.approve());

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });
});
