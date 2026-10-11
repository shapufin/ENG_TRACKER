import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterToolbar } from "./FilterToolbar";
import { Chip } from "./Chip";

describe("FilterToolbar", () => {
  it("renders its slots", () => {
    render(
      <FilterToolbar data-testid="bar">
        <FilterToolbar.Search data-testid="s">S</FilterToolbar.Search>
        <FilterToolbar.Group data-testid="g">G</FilterToolbar.Group>
      </FilterToolbar>
    );
    expect(screen.getByTestId("bar")).toHaveClass("flex", "flex-wrap", "gap-2");
    expect(screen.getByTestId("s")).toHaveClass("max-w-sm", "flex-1");
    expect(screen.getByTestId("g")).toHaveClass("ml-auto");
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("carries the data-filter-toolbar hook used by the e2e height probe", () => {
    render(<FilterToolbar data-testid="bar" />);
    expect(screen.getByTestId("bar")).toHaveAttribute("data-filter-toolbar");
  });
});

describe("Chip", () => {
  it("reflects pressed state and uses the compact chip height", () => {
    const { rerender } = render(<Chip pressed={false}>Italian TL</Chip>);
    const el = screen.getByRole("button", { name: "Italian TL" });
    expect(el).toHaveAttribute("aria-pressed", "false");
    // 28px (h-7) since the 2026-10-10 refinement: the lift's 32px token-height
    // pill read as the loudest thing on the filter row.
    expect(el).toHaveClass("h-7");
    rerender(<Chip pressed>Italian TL</Chip>);
    expect(screen.getByRole("button", { name: "Italian TL" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
