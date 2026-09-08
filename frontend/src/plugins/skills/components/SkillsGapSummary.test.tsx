import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillsGapSummary } from "./SkillsGapSummary";
import type { SkillCoverage } from "../types/skills";

const gaps: SkillCoverage[] = [
  {
    skill_id: 10,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 2,
    avg_level: 2,
  },
  {
    skill_id: 20,
    skill_name: "React",
    category_name: "Frontend",
    team_count: 2,
    avg_level: 1,
  },
];

describe("SkillsGapSummary", () => {
  it("renders nothing when there are no gaps", () => {
    const { container } = render(<SkillsGapSummary gaps={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a gap count and up to five gap pills", () => {
    render(<SkillsGapSummary gaps={gaps} />);

    expect(screen.getByText(/Gaps \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Python: avg L2/i)).toBeInTheDocument();
    expect(screen.getByText(/React: avg L1/i)).toBeInTheDocument();
  });

  it("truncates to the first five gaps", () => {
    const sixGaps: SkillCoverage[] = Array.from({ length: 6 }, (_, i) => ({
      skill_id: i + 1,
      skill_name: `Skill${i + 1}`,
      category_name: "Cat",
      team_count: 1,
      avg_level: 1,
    }));

    render(<SkillsGapSummary gaps={sixGaps} />);

    expect(screen.getByText(/Gaps \(6\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Skill1: avg L1/i)).toBeInTheDocument();
    expect(screen.getByText(/Skill5: avg L1/i)).toBeInTheDocument();
    expect(screen.queryByText(/Skill6/i)).not.toBeInTheDocument();
  });
});
