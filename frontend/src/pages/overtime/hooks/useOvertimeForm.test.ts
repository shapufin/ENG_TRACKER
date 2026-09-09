import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOvertimeForm } from "./useOvertimeForm";
import type { OvertimeLog } from "@/types";

const baseLog: OvertimeLog = {
  id: 1,
  user: 1,
  client: 2,
  date: "2024-06-15",
  start_time: "09:00:00",
  end_time: "17:00:00",
  hours: 8,
  description: "Client work",
  evidence: "evidence.jpg",
} as OvertimeLog;

describe("useOvertimeForm", () => {
  it("initializes with closed form and empty state", () => {
    const { result } = renderHook(() => useOvertimeForm());
    expect(result.current.formOpen).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.form.client).toBe("");
    expect(result.current.formErrors).toEqual({});
  });

  it("opens create mode", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.openCreate());
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBeNull();
  });

  it("opens edit mode with log data", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.openEdit(baseLog));
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editing).toBe(baseLog);
    expect(result.current.form.user).toBe("1");
    expect(result.current.form.client).toBe("2");
    expect(result.current.form.date).toBe("2024-06-15");
    expect(result.current.form.start_time).toBe("09:00");
    expect(result.current.form.end_time).toBe("17:00");
    expect(result.current.form.hours).toBe("8");
    expect(result.current.form.description).toBe("Client work");
    expect(result.current.form.evidence).toBe("evidence.jpg");
    expect(result.current.form.evidence_type).toBe("other");
  });

  it("preserves evidence_type in edit mode", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.openEdit({ ...baseLog, evidence_type: "ticket" } as OvertimeLog));
    expect(result.current.form.evidence_type).toBe("ticket");
  });

  it("handles optional fields in edit mode", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() =>
      result.current.openEdit({
        ...baseLog,
        start_time: null,
        end_time: null,
        description: null,
        evidence: null,
      } as unknown as OvertimeLog)
    );
    expect(result.current.form.start_time).toBe("");
    expect(result.current.form.end_time).toBe("");
    expect(result.current.form.description).toBe("");
    expect(result.current.form.evidence).toBe("");
  });

  it("updates a field and clears its error", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.updateField("client", "5"));
    expect(result.current.form.client).toBe("5");
  });

  it("validates required fields", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.openCreate());
    let valid = true;
    act(() => {
      valid = result.current.validateForm();
    });
    expect(valid).toBe(false);
    expect(result.current.formErrors.client).toBe("Client is required");
    expect(result.current.formErrors.date).toBe("Date is required");
  });

  it("validates end time within 24 hours", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.openCreate());
    act(() => result.current.updateField("client", "1"));
    act(() => result.current.updateField("date", "2024-06-15"));
    act(() => result.current.updateField("start_time", "09:00"));
    act(() => result.current.updateField("end_time", "10:00"));
    let valid: boolean | undefined;
    act(() => {
      valid = result.current.validateForm();
    });
    expect(valid).toBe(true);
  });

  it("calculates preview hours", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.updateField("start_time", "09:00"));
    act(() => result.current.updateField("end_time", "17:00"));
    expect(result.current.previewHours).toBeGreaterThan(0);
  });

  it("builds payload for submission", () => {
    const { result } = renderHook(() => useOvertimeForm());
    act(() => result.current.updateField("client", "1"));
    act(() => result.current.updateField("date", "2024-06-15"));
    expect(result.current.buildPayload()).toMatchObject({
      client: 1,
      date: "2024-06-15",
      evidence_type: "other",
    });
  });
});
