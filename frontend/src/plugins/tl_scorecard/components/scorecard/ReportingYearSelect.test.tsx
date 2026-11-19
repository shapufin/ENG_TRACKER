import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ReportingYearSelect } from "./ReportingYearSelect";

describe("ReportingYearSelect", () => {
  it("renders with the selected year", () => {
    const onYearChange = vi.fn();
    render(<ReportingYearSelect year={2026} onYearChange={onYearChange} />);
    expect(screen.getByRole("combobox", { name: /select year/i })).toBeDefined();
    expect(screen.getByText("2026")).toBeDefined();
  });

  it("calls onYearChange when a year is selected", () => {
    const onYearChange = vi.fn();
    render(<ReportingYearSelect year={2026} onYearChange={onYearChange} />);
    const trigger = screen.getByRole("combobox", { name: /select year/i });
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: "2027" });
    fireEvent.click(option);
    expect(onYearChange).toHaveBeenCalledWith(2027);
  });
});
