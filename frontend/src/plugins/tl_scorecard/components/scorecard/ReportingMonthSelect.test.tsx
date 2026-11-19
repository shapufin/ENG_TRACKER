import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReportingMonthSelect } from "./ReportingMonthSelect";

describe("ReportingMonthSelect", () => {
  it("renders with the selected month", () => {
    const onMonthChange = vi.fn();
    render(
      <ReportingMonthSelect
        year={2026}
        month="2026-09-01"
        onMonthChange={onMonthChange}
      />
    );
    expect(screen.getByRole("combobox", { name: /select month/i })).toBeDefined();
    expect(screen.getByText("September")).toBeDefined();
  });

  it("calls onMonthChange when a month is selected", () => {
    const onMonthChange = vi.fn();
    render(
      <ReportingMonthSelect
        year={2026}
        month="2026-09-01"
        onMonthChange={onMonthChange}
      />
    );
    const trigger = screen.getByRole("combobox", { name: /select month/i });
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "April" });
    fireEvent.click(option);
    expect(onMonthChange).toHaveBeenCalledWith("2026-04-01");
  });
});
