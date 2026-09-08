import { describe, expect, it } from "vitest";
import {
  getMemberSkillMap,
  getTopRatedSkills,
  groupSkillsByCategory,
  getVisibleCoverage,
  getPersistedVisibleSkillIds,
} from "./skillMatrixSelectors";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

const coverage: SkillCoverage[] = [
  {
    skill_id: 1,
    skill_name: "Python",
    category_name: "Backend",
    team_count: 2,
    avg_level: 3.5,
  },
  {
    skill_id: 2,
    skill_name: "React",
    category_name: "Frontend",
    team_count: 2,
    avg_level: 4,
  },
  {
    skill_id: 3,
    skill_name: "Django",
    category_name: "Backend",
    team_count: 1,
    avg_level: 5,
  },
];

const member: TeamMatrixRow = {
  user_id: 10,
  username: "alice",
  skills: [
    {
      user_skill_id: 101,
      skill_id: 1,
      skill_name: "Python",
      category_name: "Backend",
      level: 3,
    },
    {
      user_skill_id: 102,
      skill_id: 2,
      skill_name: "React",
      category_name: "Frontend",
      level: 5,
    },
    {
      user_skill_id: 103,
      skill_id: 3,
      skill_name: "Django",
      category_name: "Backend",
      level: 4,
    },
  ],
};

describe("skillMatrixSelectors", () => {
  it("maps a member's skills by skill id", () => {
    const map = getMemberSkillMap(member);

    expect(map.get(1)?.user_skill_id).toBe(101);
    expect(map.get(2)?.level).toBe(5);
    expect(map.size).toBe(3);
  });

  it("selects the highest-rated skills with deterministic tie ordering", () => {
    const skills = getTopRatedSkills(member, 2);

    expect(skills.map((skill) => skill.skill_id)).toEqual([2, 3]);
  });

  it("groups coverage by category while preserving display order", () => {
    const groups = groupSkillsByCategory(coverage);

    expect(groups.map((group) => group.name)).toEqual(["Backend", "Frontend"]);
    expect(groups[0].skills.map((skill) => skill.skill_id)).toEqual([1, 3]);
  });

  it("filters coverage to valid visible ids and keeps coverage order", () => {
    expect(getVisibleCoverage(coverage, new Set([3, 1])).map((skill) => skill.skill_id)).toEqual([
      1, 3,
    ]);
  });

  it("loads only persisted ids that are still available", () => {
    expect(getPersistedVisibleSkillIds('[3, 999, "bad"]', new Set([1, 2, 3]))).toEqual(
      new Set([3])
    );
  });

  it("falls back to all available ids when persisted columns are invalid", () => {
    expect(getPersistedVisibleSkillIds("[999]", new Set([1, 2, 3]))).toEqual(new Set([1, 2, 3]));
    expect(getPersistedVisibleSkillIds("not-json", new Set([1, 2, 3]))).toEqual(new Set([1, 2, 3]));
  });
});
