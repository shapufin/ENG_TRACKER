import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRangeSelection } from "./useRangeSelection";

describe("useRangeSelection", () => {
  it("opens the range callback only after a drag is finalized", () => {
    const onRangeSelected = vi.fn();
    const { result } = renderHook(() => useRangeSelection({ onRangeSelected }));
    const start = new Date("2026-08-10T12:00:00");
    const end = new Date("2026-08-12T12:00:00");

    act(() => result.current.handleRangeStart(start));
    act(() => result.current.handleRangeMove(end));

    expect(onRangeSelected).not.toHaveBeenCalled();
    expect(result.current.selectedDates).toEqual({ start: "2026-08-10", end: "2026-08-12" });

    act(() => result.current.finalizeRangeSelection(end));

    expect(onRangeSelected).toHaveBeenCalledTimes(1);
    expect(onRangeSelected).toHaveBeenCalledWith({ start: "2026-08-10", end: "2026-08-12" });
  });

  it("normalizes a reversed drag range", () => {
    const { result } = renderHook(() => useRangeSelection());

    act(() => result.current.handleRangeStart(new Date("2026-08-12T12:00:00")));
    act(() => result.current.handleRangeMove(new Date("2026-08-10T12:00:00")));
    act(() => result.current.finalizeRangeSelection(new Date("2026-08-10T12:00:00")));

    expect(result.current.selectedDates).toEqual({ start: "2026-08-10", end: "2026-08-12" });
  });
});
