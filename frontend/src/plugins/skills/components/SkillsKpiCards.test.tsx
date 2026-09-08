import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkillsKpiCards } from "./SkillsKpiCards";
import type { SkillCoverage } from "../types/skills";

const cov = (
  skill_id: number,
  skill_name: string,
  category_name: string,
  team_count: number,
  avg_level: number
): SkillCoverage => ({ skill_id, skill_name, category_name, team_count, avg_level });

const coverage = [
  cov(1, "Django", "Backend", 19, 2.8),
  cov(2, "Linux", "Infra", 19, 4.2),
  cov(3, "Go", "Backend", 18, 3.9),
];

const gaps = [cov(1, "Django", "Backend", 2, 1.5), cov(3, "Go", "Backend", 4, 2.5)];

describe("SkillsKpiCards", () => {
  it("renders all four KPI cards with computed values", () => {
    render(<SkillsKpiCards coverage={coverage} gaps={gaps} memberCount={19} />);
    expect(screen.getByText("Team Seniority Index")).toBeInTheDocument();
    expect(screen.getByText("Strongest Domain")).toBeInTheDocument();
    expect(screen.getByText("Critical Gap")).toBeInTheDocument();
    expect(screen.getByText("Verification Rate")).toBeInTheDocument();
    // Seniority: weighted mean of (2.8*19 + 4.2*19 + 3.9*18) / 56 = 3.6
    expect(screen.getByText("L3.6")).toBeInTheDocument();
    // Strongest domain: Infra (4.2) beats Backend ((2.8+3.9)/2 = 3.4)
    expect(screen.getByText("Infra")).toBeInTheDocument();
    // Critical gap: Django 2/19
    expect(screen.getByText("Django")).toBeInTheDocument();
    expect(screen.getByText("2 / 19 rated")).toBeInTheDocument();
    // Verification: (19+19+18)/(19*3) = 56/57 = 98%
    expect(screen.getByText("98%")).toBeInTheDocument();
  });

  it("renders nothing when there is no data at all", () => {
    const { container } = render(<SkillsKpiCards coverage={[]} gaps={[]} memberCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("omits the critical gap card when the gap report is empty", () => {
    render(<SkillsKpiCards coverage={coverage} gaps={[]} memberCount={19} />);
    expect(screen.getByText("Team Seniority Index")).toBeInTheDocument();
    expect(screen.queryByText("Critical Gap")).not.toBeInTheDocument();
  });

  it("omits the seniority card when nothing is rated", () => {
    render(<SkillsKpiCards coverage={[cov(1, "A", "Cat", 0, 0)]} gaps={[]} memberCount={5} />);
    expect(screen.queryByText("Team Seniority Index")).not.toBeInTheDocument();
  });
});
