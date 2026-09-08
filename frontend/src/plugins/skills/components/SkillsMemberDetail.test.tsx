import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsMemberDetail } from "./SkillsMemberDetail";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

const coverage: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 1,
    avg_level: 3,
  },
  {
    skill_id: 20,
    skill_name: "React",
    category_name: "Frontend",
    team_count: 0,
    avg_level: 0,
  },
];

const row: TeamMatrixRow = {
  user_id: 100,
  username: "alice",
  skills: [
    {
      user_skill_id: 999,
      skill_id: 10,
      skill_name: "Python",
      category_name: "Backend",
      level: 3,
    },
  ],
};

describe("SkillsMemberDetail", () => {
  it("renders rated and unrated skills", () => {
    render(<SkillsMemberDetail row={row} coverage={coverage} onRate={vi.fn()} />);

    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getAllByText("L3").length).toBeGreaterThan(0);
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Not rated")).toBeInTheDocument();
    expect(screen.getByText("Backend (1)")).toBeInTheDocument();
    expect(screen.getByText("Frontend (1)")).toBeInTheDocument();
  });

  it("sends the embedded UserSkill id when a rated skill is selected", () => {
    const onRate = vi.fn();
    render(<SkillsMemberDetail row={row} coverage={coverage} onRate={onRate} />);

    fireEvent.click(screen.getByRole("button", { name: /Rate alice Python L3/i }));

    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 999,
      username: "alice",
      skillName: "Python",
      currentLevel: 3,
    });
  });

  it("caps initially visible skills and offers Show all when a category is large", () => {
    const manySkills: SkillCoverage[] = Array.from({ length: 15 }, (_, i) => ({
      skill_id: 100 + i,
      skill_name: `Skill ${i + 1}`,
      category_name: "Backend",
      team_count: 1,
      avg_level: 2,
    }));
    render(<SkillsMemberDetail row={row} coverage={manySkills} onRate={vi.fn()} />);

    expect(screen.getByText("Backend (15)")).toBeInTheDocument();
    expect(screen.getByText("Skill 10")).toBeInTheDocument();
    expect(screen.queryByText("Skill 11")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show all 15 skills/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show all 15 skills/i }));
    expect(screen.getByText("Skill 11")).toBeInTheDocument();
    expect(screen.getByText("Skill 15")).toBeInTheDocument();
  });
});
