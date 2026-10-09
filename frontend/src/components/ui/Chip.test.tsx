import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("exposes the toggle state as aria-pressed", () => {
    const { rerender } = render(<Chip pressed={false}>All</Chip>);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    rerender(<Chip pressed>All</Chip>);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps a pressed chip distinguishable in forced-colors mode", () => {
    render(<Chip pressed>Active</Chip>);
    const chip = screen.getByRole("button", { name: "Active" });
    expect(chip.className).toContain("forced-colors:bg-[Highlight]");
    expect(chip.className).toContain("forced-colors:text-[HighlightText]");
    expect(chip.className).toContain("forced-colors:border-[Highlight]");
    // The check glyph is decoration, shown only when colour is forced.
    const glyph = chip.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden", "true");
    expect(glyph?.getAttribute("class")).toContain("forced-colors:block");
  });

  it("draws no check glyph on an unpressed chip", () => {
    render(<Chip pressed={false}>Idle</Chip>);
    expect(screen.getByRole("button", { name: "Idle" }).querySelector("svg")).toBeNull();
  });

  it("sits on the control-sm height token, which grows under coarse pointers", () => {
    render(<Chip pressed={false}>Idle</Chip>);
    expect(screen.getByRole("button", { name: "Idle" }).className).toContain(
      "h-[var(--control-h-sm)]"
    );
  });
});
