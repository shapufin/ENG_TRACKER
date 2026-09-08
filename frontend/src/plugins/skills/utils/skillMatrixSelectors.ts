import type { SkillCoverage, TeamMatrixRow } from "../types/skills";

type MemberSkill = TeamMatrixRow["skills"][number];

export interface SkillCoverageGroup {
  name: string;
  skills: SkillCoverage[];
}

export const getMemberSkillMap = (member: TeamMatrixRow): Map<number, MemberSkill> =>
  new Map(member.skills.map((skill) => [skill.skill_id, skill]));

export const getTopRatedSkills = (member: TeamMatrixRow, limit = 5): MemberSkill[] =>
  [...member.skills]
    .sort(
      (a, b) =>
        b.level - a.level || a.skill_name.localeCompare(b.skill_name) || a.skill_id - b.skill_id
    )
    .slice(0, Math.max(0, limit));

export const groupSkillsByCategory = (skills: SkillCoverage[]): SkillCoverageGroup[] => {
  const groups: SkillCoverageGroup[] = [];
  const groupByName = new Map<string, SkillCoverageGroup>();

  for (const skill of skills) {
    let group = groupByName.get(skill.category_name);
    if (!group) {
      group = { name: skill.category_name, skills: [] };
      groupByName.set(skill.category_name, group);
      groups.push(group);
    }
    group.skills.push(skill);
  }

  return groups;
};

export const getVisibleCoverage = (
  coverage: SkillCoverage[],
  visibleSkillIds: Set<number>
): SkillCoverage[] => coverage.filter((skill) => visibleSkillIds.has(skill.skill_id));

export const getPersistedVisibleSkillIds = (
  raw: string | null,
  availableSkillIds: Set<number>
): Set<number> => {
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const visible = new Set(
          parsed.filter((id): id is number => Number.isInteger(id) && availableSkillIds.has(id))
        );
        if (visible.size > 0) return visible;
      }
    } catch {
      return new Set(availableSkillIds);
    }
  }
  return new Set(availableSkillIds);
};
