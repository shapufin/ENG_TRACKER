import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStandbyForm } from "./useStandbyForm";
import type { StandbyLog } from "@/types";

const baseLog: StandbyLog = {
  id: 1,
  user: 1,
  date: "2024-06-15",
  start_time: "18:00:00",
  end_time: "09:00:00",
  hours: 15,
  description: "Night standby",
} as StandbyLog;

describe("useStandbyForm", () => {
  it("initializes with default state", () => {
    const { result } = renderHook(() => useStandbyForm());
    expect(result.current.formOpen).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.weeklyForm.start_time).toBe("18:00");
    expect(result.current.weeklyPreview).toEqual([]);
  });

  it("opens create mode", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.openCreate());
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBeNull();
  });

  it("opens edit mode with log data", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.openEdit(baseLog));
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBe(baseLog);
    expect(result.current.form.user).toBe("1");
    expect(result.current.form.start_time).toBe("18:00");
  });

  it("validates required fields", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.openCreate());
    let valid = true;
    act(() => {
      valid = result.current.validateForm();
    });
    expect(valid).toBe(false);
    expect(result.current.formErrors.date).toBe("Date is required");
  });

  it("generates weekly preview when start_date is set", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2024-06-15" }));
    expect(result.current.weeklyPreview).toHaveLength(7);
  });

  it("resets weekly preview when start_date is cleared", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2024-06-15" }));
    act(() => result.current.patchWeeklyForm({ start_date: "" }));
    expect(result.current.weeklyPreview).toEqual([]);
  });

  it("updates a preview row", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2024-06-15" }));
    act(() => result.current.updatePreviewRow(0, "hours", 10));
    expect(result.current.weeklyPreview[0].hours).toBe(10);
    expect(result.current.weeklyPreview[0].isEdited).toBe(true);
  });

  it("resets a preview row to default", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2024-06-15" }));
    act(() => result.current.updatePreviewRow(0, "hours", 10));
    act(() => result.current.resetPreviewRow(0));
    expect(result.current.weeklyPreview[0].isEdited).toBe(false);
  });

  it("resets weekly form", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2024-06-15" }));
    act(() => result.current.resetWeeklyForm());
    expect(result.current.weeklyForm.start_date).toBe("");
    expect(result.current.weeklyPreview).toEqual([]);
  });

  it("builds payload for submission", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.updateField("date", "2024-06-15"));
    expect(result.current.buildPayload()).toMatchObject({ date: "2024-06-15" });
  });
});
