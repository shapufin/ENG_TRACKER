import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeading } from "./SectionHeading";

describe("SectionHeading", () => {
  it("renders an h2 with eyebrow and meta", () => {
    render(<SectionHeading id="s1" eyebrow="Step 1" title="Overview" meta="12 items" />);
    const h2 = screen.getByRole("heading", { level: 2, name: "Overview" });
    expect(h2).toHaveAttribute("id", "s1");
    expect(h2.className).toContain("text-balance");
    expect(screen.getByText("Step 1").className).toContain("uppercase");
    expect(screen.getByText("12 items").className).toContain("text-muted-foreground");
  });
});
