import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrendIndicator } from "./TrendIndicator";

// Browser probe (dark): value + label at 3.18:1 FAIL. Text nodes use
// text-foreground; the trend glyph keeps the inherited violet icon treatment.
describe("TrendIndicator text contrast", () => {
  it("value and label use text-foreground, not text-primary", () => {
    render(<TrendIndicator trend="stable" percentChange={0} />);
    const value = screen.getByText("0%");
    expect(value.className).toContain("text-foreground");
    expect(value.className).not.toMatch(/(^|\s)text-primary(\s|$)/);
    const label = screen.getByText("Stable vs last month");
    expect(label.className).toContain("text-foreground");
  });
});
