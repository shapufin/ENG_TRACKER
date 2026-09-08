import { describe, expect, it } from "vitest";
import type { SkillCoverage } from "../types/skills";
import {
  computeCriticalGap,
  computeSeniorityIndex,
  computeStrongestDomain,
  computeVerificationRate,
} from "./skillKpis";

const cov = (
  skill_id: number,
  skill_name: string,
  category_name: string,
  team_count: number,
  avg_level: number
): SkillCoverage => ({ skill_id, skill_name, category_name, team_count, avg_level });

describe("computeSeniorityIndex", () => {
  it("computes the rating-weighted mean across skills", () => {
    const kpi = computeSeniorityIndex([cov(1, "A", "Cat", 3, 4.0), cov(2, "B", "Cat", 1, 2.0)]);
    expect(kpi).not.toBeNull();
    expect(kpi!.avg).toBe(3.5);
    expect(kpi!.pct).toBe(70);
  });

  it("maps the average to the nearest level label", () => {
    expect(computeSeniorityIndex([cov(1, "A", "Cat", 2, 3.4)])!.label).toBe("Proficient");
    expect(computeSeniorityIndex([cov(1, "A", "Cat", 2, 4.6)])!.label).toBe("Mastery");
  });

  it("returns null when nothing is rated", () => {
    expect(computeSeniorityIndex([cov(1, "A", "Cat", 0, 0)])).toBeNull();
    expect(computeSeniorityIndex([])).toBeNull();
  });
});

describe("computeStrongestDomain", () => {
  it("returns the category with the highest mean avg_level", () => {
    const kpi = computeStrongestDomain([
      cov(1, "A", "Backend", 2, 3.0),
      cov(2, "B", "Backend", 2, 4.0),
      cov(3, "C", "Infra", 2, 4.5),
    ]);
    expect(kpi!.name).toBe("Infra");
    expect(kpi!.avg).toBe(4.5);
    expect(kpi!.pct).toBe(90);
  });

  it("breaks ties alphabetically", () => {
    const kpi = computeStrongestDomain([cov(1, "A", "Zeta", 1, 4.0), cov(2, "B", "Alpha", 1, 4.0)]);
    expect(kpi!.name).toBe("Alpha");
  });

  it("returns null when nothing is rated", () => {
    expect(computeStrongestDomain([cov(1, "A", "Cat", 0, 0)])).toBeNull();
  });
});

describe("computeCriticalGap", () => {
  it("returns the worst gap with rated/team-size context", () => {
    const kpi = computeCriticalGap(
      [cov(9, "Django", "Backend", 2, 1.5), cov(8, "Go", "Backend", 4, 2.5)],
      19
    );
    expect(kpi).toEqual({
      skillName: "Django",
      ratedCount: 2,
      teamSize: 19,
    });
  });

  it("returns null when there are no gaps", () => {
    expect(computeCriticalGap([], 19)).toBeNull();
  });
});

describe("computeVerificationRate", () => {
  it("computes rated / (members × skills)", () => {
    const kpi = computeVerificationRate(
      [cov(1, "A", "Cat", 19, 3.0), cov(2, "B", "Cat", 18, 3.0)],
      19
    );
    expect(kpi!.rated).toBe(37);
    expect(kpi!.total).toBe(38);
    expect(kpi!.pct).toBe(97);
  });

  it("returns null when there are no members or skills", () => {
    expect(computeVerificationRate([], 19)).toBeNull();
    expect(computeVerificationRate([cov(1, "A", "Cat", 1, 3)], 0)).toBeNull();
  });
});
