import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsColumnSelector } from "./SkillsColumnSelector";
import type { SkillCoverage } from "../types/skills";

const coverage: SkillCoverage[] = [
  {
    skill_id: 1,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 1,
    avg_level: 3,
  },
  {
    skill_id: 2,
    skill_name: "React",
    category_name: "Frontend",
    team_count: 1,
    avg_level: 4,
  },
];

describe("SkillsColumnSelector", () => {
  it("shows grouped skills and toggles a visible column", () => {
    const onChange = vi.fn();
    render(
      <SkillsColumnSelector
        coverage={coverage}
        visibleSkillIds={new Set([1, 2])}
        onVisibleSkillIdsChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getByText("Frontend")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show Python" }));
    expect(onChange).toHaveBeenCalledWith(new Set([2]));
  });

  it("prevents hiding the final visible skill", () => {
    const onChange = vi.fn();
    render(
      <SkillsColumnSelector
        coverage={coverage}
        visibleSkillIds={new Set([1])}
        onVisibleSkillIdsChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /columns/i }));
    const python = screen.getByRole("checkbox", { name: "Show Python" });
    expect(python).toBeDisabled();
  });
});
