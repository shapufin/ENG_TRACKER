import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { presetRange, ReportPeriodPresets } from "./ReportPeriodPresets";

describe("presetRange", () => {
  it("last_month across a year boundary", () => {
    expect(presetRange("last_month", new Date(2026, 0, 15))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
  });
  it("this_month", () => {
    expect(presetRange("this_month", new Date(2026, 1, 10))).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
  it("this_quarter", () => {
    expect(presetRange("this_quarter", new Date(2026, 4, 10))).toEqual({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });
  it("ytd ends today", () => {
    expect(presetRange("ytd", new Date(2026, 4, 10))).toEqual({
      start: "2026-01-01",
      end: "2026-05-10",
    });
  });
});

describe("ReportPeriodPresets", () => {
  it("calls onSelect with the range and marks the matching chip pressed", () => {
    const onSelect = vi.fn();
    const now = new Date();
    const { start, end } = presetRange("this_month", now);
    render(<ReportPeriodPresets start={start} end={end} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Last month" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: "Last month" }));
    expect(onSelect).toHaveBeenCalledWith(presetRange("last_month", now));
  });
});
