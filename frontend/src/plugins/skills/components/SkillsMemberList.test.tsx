import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillsMemberList } from "./SkillsMemberList";
import type { TeamMatrixRow } from "../types/skills";

const rows: TeamMatrixRow[] = [
  {
    user_id: 1,
    username: "alice",
    skills: [
      {
        user_skill_id: 10,
        skill_id: 1,
        skill_name: "Python",
        category_name: "Backend",
        level: 5,
      },
    ],
  },
];

describe("SkillsMemberList", () => {
  it("renders a member's top skills and sends the rating target", () => {
    const onRate = vi.fn();
    render(<SkillsMemberList rows={rows} onRate={onRate} />);

    expect(screen.getByText("alice")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rate alice Python L5" }));

    expect(onRate).toHaveBeenCalledWith({
      userSkillId: 10,
      username: "alice",
      skillName: "Python",
      currentLevel: 5,
    });
  });

  it("shows an empty member profile when no skills are rated", () => {
    render(
      <SkillsMemberList rows={[{ user_id: 2, username: "bob", skills: [] }]} onRate={vi.fn()} />
    );

    expect(screen.getByText("No skills rated yet.")).toBeInTheDocument();
  });
});
