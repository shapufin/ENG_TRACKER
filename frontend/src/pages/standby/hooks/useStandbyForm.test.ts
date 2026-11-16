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

  describe("weekly generator splits every night at midnight (audit F1, 2026-11-16)", () => {
    type Row = { date: string; start: string; end: string; hours: number };
    const minutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    /** [startMinute, endMinute) on one absolute timeline counted from 2026-01-01. */
    const span = (r: Row) => {
      const day = Math.round(
        (Date.parse(`${r.date}T00:00:00Z`) - Date.UTC(2026, 0, 1)) / 86_400_000
      );
      const start = day * 1440 + minutes(r.start);
      const length = (minutes(r.end) - minutes(r.start) + 1440) % 1440 || 1440;
      return [start, start + length];
    };
    const preview = (patch: Record<string, unknown>) => {
      const { result } = renderHook(() => useStandbyForm());
      act(() => result.current.patchWeeklyForm(patch));
      return result.current.weeklyPreview as Row[];
    };
    const total = (rows: Row[]) => rows.reduce((sum, r) => sum + r.hours, 0);
    const noOverlap = (rows: Row[]) => {
      const spans = rows.map(span).sort((a, b) => a[0] - b[0]);
      spans.slice(1).forEach((s, i) => expect(s[0]).toBeGreaterThanOrEqual(spans[i][1]));
    };

    it("Monday start with weekend 24h on: 12 rows, 123h, 8 dates, no overlap", () => {
      const rows = preview({ start_date: "2026-11-16", weekend_24h: true });
      expect(rows.map((r) => [r.date, r.start, r.end, r.hours])).toEqual([
        ["2026-11-16", "18:00", "00:00", 6],
        ["2026-11-17", "00:00", "09:00", 9],
        ["2026-11-17", "18:00", "00:00", 6],
        ["2026-11-18", "00:00", "09:00", 9],
        ["2026-11-18", "18:00", "00:00", 6],
        ["2026-11-19", "00:00", "09:00", 9],
        ["2026-11-19", "18:00", "00:00", 6],
        ["2026-11-20", "00:00", "09:00", 9],
        ["2026-11-20", "18:00", "00:00", 6],
        ["2026-11-21", "00:00", "00:00", 24],
        ["2026-11-22", "00:00", "00:00", 24],
        ["2026-11-23", "00:00", "09:00", 9],
      ]);
      expect(total(rows)).toBe(123);
      expect(new Set(rows.map((r) => r.date)).size).toBe(8);
      noOverlap(rows);
    });

    it("weekend 24h off gives the weekday pair on Saturday and Sunday", () => {
      const rows = preview({ start_date: "2026-11-16", weekend_24h: false });
      expect(rows.filter((r) => r.date === "2026-11-21")).toHaveLength(2);
      expect(rows.filter((r) => r.date === "2026-11-22")).toHaveLength(2);
      expect(rows.at(-1)).toMatchObject({ date: "2026-11-23", start: "00:00", end: "09:00" });
      noOverlap(rows);
    });

    it("a Thursday start keeps 24h weekend rows and closes 7 days later", () => {
      const rows = preview({ start_date: "2026-11-19", weekend_24h: true });
      expect(rows.filter((r) => r.hours === 24).map((r) => r.date)).toEqual([
        "2026-11-21",
        "2026-11-22",
      ]);
      expect(rows.at(-1)).toMatchObject({ date: "2026-11-26", start: "00:00", end: "09:00" });
      noOverlap(rows);
    });

    it("a same-day range gives one row per day and no closing row", () => {
      const rows = preview({
        start_date: "2026-11-16",
        start_time: "09:00",
        end_time: "17:00",
        weekend_24h: false,
      });
      expect(rows).toHaveLength(7);
      expect(rows.every((r) => r.start === "09:00" && r.end === "17:00" && r.hours === 8)).toBe(
        true
      );
    });

    it("an end time of 00:00 needs no tail rows", () => {
      const rows = preview({ start_date: "2026-11-16", end_time: "00:00", weekend_24h: false });
      expect(rows).toHaveLength(7);
      expect(rows.every((r) => r.start === "18:00" && r.end === "00:00")).toBe(true);
    });
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

  it("editing or resetting the second row of a date leaves the first untouched", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2026-11-16", weekend_24h: true }));
    const original = result.current.weeklyPreview[1]; // Tue 00:00-09:00
    expect(result.current.weeklyPreview[2].date).toBe(original.date);
    act(() => result.current.updatePreviewRow(2, "start", "19:00"));
    expect(result.current.weeklyPreview[1]).toEqual(original);
    expect(result.current.weeklyPreview[2]).toMatchObject({
      start: "19:00",
      hours: 5,
      isEdited: true,
    });
    act(() => result.current.resetPreviewRow(2));
    expect(result.current.weeklyPreview[2]).toMatchObject({
      start: "18:00",
      end: "00:00",
      hours: 6,
      isEdited: false,
    });
    expect(result.current.weeklyPreview[1]).toEqual(original);
  });

  it("resets a weekend row to the 24h row in local time", () => {
    const { result } = renderHook(() => useStandbyForm());
    act(() => result.current.patchWeeklyForm({ start_date: "2026-11-16", weekend_24h: true }));
    const saturday = result.current.weeklyPreview.findIndex((r) => r.date === "2026-11-21");
    act(() => result.current.updatePreviewRow(saturday, "hours", 10));
    act(() => result.current.resetPreviewRow(saturday));
    expect(result.current.weeklyPreview[saturday]).toMatchObject({
      start: "00:00",
      end: "00:00",
      hours: 24,
      isWeekend: true,
      isEdited: false,
    });
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
