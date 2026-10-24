import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOvertimeHoursPreview, previewNote } from "./useOvertimeHoursPreview";
import { overtimeService } from "@/services/overtimeService";

vi.mock("@/services/overtimeService", () => ({
  overtimeService: { previewHours: vi.fn() },
}));

const previewHours = vi.mocked(overtimeService.previewHours);

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const filled = { date: "2026-10-26", startTime: "08:31", endTime: "09:00", editingId: null };

describe("useOvertimeHoursPreview", () => {
  beforeEach(() => previewHours.mockReset());

  it("asks nothing until the date and both times are filled in", () => {
    renderHook(() => useOvertimeHoursPreview({ ...filled, startTime: "" }), { wrapper });
    renderHook(() => useOvertimeHoursPreview({ ...filled, date: "" }), { wrapper });
    expect(previewHours).not.toHaveBeenCalled();
  });

  it("returns the share the entry would be paid", async () => {
    previewHours.mockResolvedValue({
      hours: 0.5,
      paid_window_start: "08:00:00",
      paid_window_end: "09:00:00",
    });
    const { result } = renderHook(() => useOvertimeHoursPreview(filled), { wrapper });
    await waitFor(() => expect(result.current.data?.hours).toBe(0.5));
    expect(previewHours).toHaveBeenCalledWith({
      date: "2026-10-26",
      start_time: "08:31",
      end_time: "09:00",
      exclude: undefined,
    });
  });

  it("leaves the entry being edited out of its own preview", async () => {
    previewHours.mockResolvedValue({ hours: 1, paid_window_start: "08:00:00", paid_window_end: "09:00:00" });
    renderHook(() => useOvertimeHoursPreview({ ...filled, editingId: 42 }), { wrapper });
    await waitFor(() => expect(previewHours).toHaveBeenCalled());
    expect(previewHours.mock.calls[0][0].exclude).toBe(42);
  });
});

describe("previewNote", () => {
  it("names the block an entry shares", () => {
    expect(
      previewNote({ hours: 0.5, paid_window_start: "08:00:00", paid_window_end: "09:00:00" })
    ).toBe("Block 08:00-09:00");
  });

  it("says when the hour is already covered", () => {
    expect(
      previewNote({ hours: 0, paid_window_start: "08:00:00", paid_window_end: "09:00:00" })
    ).toBe("Covered by 08:00-09:00");
  });

  it("says nothing without a preview", () => {
    expect(previewNote(undefined)).toBeUndefined();
  });
});
