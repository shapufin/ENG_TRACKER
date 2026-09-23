import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "./StatCard";

// Design contract: mini stat is label-first — the value keeps the mono/tabular
// treatment but the card owns no progress bar (the summary band does).
describe("calendar StatCard", () => {
  it("renders the value with font-mono tabular-nums numerals", () => {
    render(<StatCard label="Leave Used" value="12" suffix="d" sub="57% of 22 d" tone="danger" />);

    const value = screen.getByText("12");
    expect(value.className).toContain("font-mono");
    expect(value.className).toContain("tabular-nums");
  });

  it("renders label, suffix and sub copy", () => {
    render(<StatCard label="Leave Used" value="12" suffix="d" sub="57% of 22 d" tone="danger" />);

    expect(screen.getByText("Leave Used")).toBeInTheDocument();
    expect(screen.getByText("d")).toBeInTheDocument();
    expect(screen.getByText("57% of 22 d")).toBeInTheDocument();
  });

  it("owns no progress bar", () => {
    const { container } = render(
      <StatCard label="Leave Used" value="12" suffix="d" sub="57% of 22 d" tone="danger" />
    );

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});
