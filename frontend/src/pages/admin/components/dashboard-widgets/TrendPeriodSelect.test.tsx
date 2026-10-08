import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrendPeriodSelect } from "./TrendPeriodSelect";

describe("TrendPeriodSelect", () => {
  it("offers 3, 6, 12 and 24 months and marks the current one", () => {
    render(<TrendPeriodSelect value="12" onChange={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Trend period" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "3m",
      "6m",
      "12m",
      "24m",
    ]);
    expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "6 months" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("reports the chosen period", () => {
    const onChange = vi.fn();
    render(<TrendPeriodSelect value="12" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "6 months" }));
    expect(onChange).toHaveBeenCalledWith("6");
  });
});
