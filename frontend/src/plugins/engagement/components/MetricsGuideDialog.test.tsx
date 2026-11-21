import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MetricsGuideDialog } from "./MetricsGuideDialog";
import { SCORE_PARTS } from "./scoreParts";

describe("SCORE_PARTS", () => {
  it("weights add up to 100, as COMPONENT_WEIGHTS does on the server", () => {
    expect(SCORE_PARTS.reduce((sum, part) => sum + part.weight, 0)).toBe(100);
    expect(SCORE_PARTS.map((part) => part.weight)).toEqual([40, 20, 20, 20]);
  });
});

describe("MetricsGuideDialog", () => {
  it("states 2 working days for overtime and 5 for standby", () => {
    render(<MetricsGuideDialog open={true} onOpenChange={vi.fn()} />);
    expect(
      screen.getByText("Overtime: end of the 2nd working day after submission.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Standby: end of the 5th working day after submission.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Overtime and standby/)).toBeNull();
  });
});
