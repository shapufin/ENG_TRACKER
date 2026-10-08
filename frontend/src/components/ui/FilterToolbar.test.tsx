import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterToolbar } from "./FilterToolbar";
import { Chip } from "./Chip";

describe("FilterToolbar", () => {
  it("renders its slots", () => {
    render(
      <FilterToolbar data-testid="bar">
        <FilterToolbar.Search data-testid="s">S</FilterToolbar.Search>
        <FilterToolbar.Chips data-testid="c">C</FilterToolbar.Chips>
        <FilterToolbar.Group data-testid="g">G</FilterToolbar.Group>
      </FilterToolbar>
    );
    expect(screen.getByTestId("bar")).toHaveClass("flex", "flex-wrap", "gap-2");
    expect(screen.getByTestId("s")).toHaveClass("max-w-sm", "flex-1");
    expect(screen.getByTestId("c")).toHaveClass("overflow-x-auto", "snap-x");
    expect(screen.getByTestId("g")).toHaveClass("ml-auto");
    expect(screen.getByText("G")).toBeInTheDocument();
  });
});

describe("Chip", () => {
  it("reflects pressed state and uses the small control height", () => {
    const { rerender } = render(<Chip pressed={false}>Italian TL</Chip>);
    const el = screen.getByRole("button", { name: "Italian TL" });
    expect(el).toHaveAttribute("aria-pressed", "false");
    expect(el).toHaveClass("h-[var(--control-h-sm)]");
    rerender(<Chip pressed>Italian TL</Chip>);
    expect(screen.getByRole("button", { name: "Italian TL" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
