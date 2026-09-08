import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillsLevelLegend } from "./SkillsLevelLegend";

describe("SkillsLevelLegend", () => {
  it("renders all five levels plus the unrated entry", () => {
    render(<SkillsLevelLegend />);
    const list = screen.getByRole("list", {
      name: /proficiency level color legend/i,
    });
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(screen.getByText("L1 Foundational")).toBeInTheDocument();
    expect(screen.getByText("L3 Proficient")).toBeInTheDocument();
    expect(screen.getByText("L5 Mastery")).toBeInTheDocument();
    expect(screen.getByText("Unrated")).toBeInTheDocument();
  });

  it("accepts a custom className", () => {
    const { container } = render(<SkillsLevelLegend className="custom-class" />);
    expect(container.firstElementChild).toHaveClass("custom-class");
  });
});
