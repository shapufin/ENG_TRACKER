import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProficiencyBadge } from "./ProficiencyBadge";
import { PROFICIENCY_LEVELS, levelLabel } from "../utils/proficiencyLevels";

describe("ProficiencyBadge", () => {
  it("renders all 5 levels with the correct numeric value", () => {
    for (const { level } of PROFICIENCY_LEVELS) {
      const { unmount } = render(<ProficiencyBadge level={level} />);
      expect(screen.getByText(String(level))).toBeInTheDocument();
      unmount();
    }
  });

  it("applies the theme-safe tinted level color class", () => {
    const { container } = render(<ProficiencyBadge level={5} />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-emerald-500/20");
  });

  it("includes a border on the outer span (new shape)", () => {
    const { container } = render(<ProficiencyBadge level={3} />);
    expect(container.querySelector("span")?.className).toContain("border");
  });

  it("renders an inner dot swatch with the level's solid dot color", () => {
    const { container } = render(<ProficiencyBadge level={3} />);
    const dot = container.querySelector("span > span");
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain("bg-amber-500");
  });

  it("PROFICIENCY_LEVELS entries have a dot field", () => {
    for (const entry of PROFICIENCY_LEVELS) {
      expect(entry.dot).toBeTruthy();
      expect(typeof entry.dot).toBe("string");
    }
  });

  it("hides the label by default", () => {
    render(<ProficiencyBadge level={3} />);
    expect(screen.queryByText(levelLabel(3))).not.toBeInTheDocument();
  });

  it("shows the label when showLabel is true (always visible)", () => {
    render(<ProficiencyBadge level={4} showLabel />);
    expect(screen.getByText(levelLabel(4))).toBeInTheDocument();
  });

  it("uses the small size class when size=sm", () => {
    const { container } = render(<ProficiencyBadge level={2} size="sm" />);
    expect(container.querySelector("span")?.className).toContain("text-[10px]");
  });

  it("uses the medium size class when size=md", () => {
    const { container } = render(<ProficiencyBadge level={2} size="md" />);
    expect(container.querySelector("span")?.className).toContain("text-xs");
  });

  it("falls back to theme tokens for an unknown level", () => {
    const { container } = render(<ProficiencyBadge level={99} />);
    // Outer span falls back to bg-muted (theme token, not hardcoded gray).
    expect(container.querySelector("span")?.className).toContain("bg-muted");
    // Inner dot falls back to bg-muted-foreground.
    const dot = container.querySelector("span > span");
    expect(dot?.className).toContain("bg-muted-foreground");
  });

  it("has an accessible aria-label", () => {
    render(<ProficiencyBadge level={1} />);
    expect(screen.getByLabelText(`Proficiency level 1: ${levelLabel(1)}`)).toBeInTheDocument();
  });
});
