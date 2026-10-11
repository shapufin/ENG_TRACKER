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

  it("sits at the mockup's compact 28px chip height", () => {
    render(<Chip pressed={false}>Idle</Chip>);
    const chip = screen.getByRole("button", { name: "Idle" });
    // 28px keeps the WCAG 2.2 AA target size (>= 24px) while reading as a
    // filter chip rather than a toolbar button.
    expect(chip.className).toContain("h-7");
    expect(chip.className).toContain("rounded-lg");
    expect(chip.className).toContain("text-xs");
  });

  it("rests on a soft fill and presses to a soft tint, never a solid pill", () => {
    const { rerender } = render(<Chip pressed={false}>Idle</Chip>);
    const idle = screen.getByRole("button", { name: "Idle" });
    expect(idle.className).toContain("bg-muted");
    expect(idle.className).toContain("border-transparent");
    expect(idle.className).not.toContain("rounded-full");
    rerender(<Chip pressed>Idle</Chip>);
    const active = screen.getByRole("button", { name: "Idle" });
    expect(active.className).toContain("bg-primary/10");
    expect(active.className).toContain("text-primary");
    expect(active.className).not.toContain("bg-primary ");
  });
});
