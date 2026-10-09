import React, { useMemo, useState } from "react";
import { levelColor } from "../utils/proficiencyLevels";
import { Button } from "@/components/ui/button";
import type { SkillCoverage, TeamMatrixRow } from "../types/skills";
import type { SkillRateTarget } from "./SkillsMemberList";

const INITIAL_SKILLS_PER_CATEGORY = 10;

interface SkillsMemberDetailProps {
  row: TeamMatrixRow;
  coverage: SkillCoverage[];
  onRate: (target: SkillRateTarget) => void;
}

export const SkillsMemberDetail: React.FC<SkillsMemberDetailProps> = ({
  row,
  coverage,
  onRate,
}) => {
  const [showAll, setShowAll] = useState(false);
  const categoryGroups = useMemo(() => {
    const groups: { name: string; skills: SkillCoverage[] }[] = [];
    for (const skill of coverage) {
      let group = groups.find((candidate) => candidate.name === skill.category_name);
      if (!group) {
        group = { name: skill.category_name, skills: [] };
        groups.push(group);
      }
      group.skills.push(skill);
    }
    return groups;
  }, [coverage]);

  const totalSkills = categoryGroups.reduce((sum, group) => sum + group.skills.length, 0);
  const hasMore = categoryGroups.some((group) => group.skills.length > INITIAL_SKILLS_PER_CATEGORY);

  return (
    <div className="divide-border border-border divide-y border-t">
      {categoryGroups.map((group) => {
        const visibleSkills = showAll
          ? group.skills
          : group.skills.slice(0, INITIAL_SKILLS_PER_CATEGORY);
        return (
          <section key={group.name} aria-label={`${group.name} skills`}>
            <h3 className="text-muted-foreground px-3 py-2 text-xs font-semibold tracking-wide uppercase">
              {group.name} ({group.skills.length})
            </h3>
            <div className="divide-border/70 divide-y">
              {visibleSkills.map((coverageSkill) => {
                const skill = row.skills.find(
                  (candidate) => candidate.skill_id === coverageSkill.skill_id
                );
                if (!skill) {
                  return (
                    <div key={coverageSkill.skill_id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium" title={coverageSkill.skill_name}>
                          {coverageSkill.skill_name}
                        </p>
                        <p className="text-muted-foreground text-xs">No rating available</p>
                      </div>
                      <span
                        className="border-border text-muted-foreground inline-flex min-h-[44px] items-center justify-center rounded border px-3 text-sm"
                        aria-label={`${row.username} ${coverageSkill.skill_name} — not rated`}
                      >
                        Not rated
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={coverageSkill.skill_id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" title={coverageSkill.skill_name}>
                        {coverageSkill.skill_name}
                      </p>
                      <p className="text-muted-foreground text-xs">L{skill.level}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onRate({
                          userSkillId: skill.user_skill_id,
                          username: row.username,
                          skillName: coverageSkill.skill_name,
                          currentLevel: skill.level,
                        })
                      }
                      className={`inline-flex min-h-[44px] items-center justify-center rounded border px-3 text-sm font-semibold ${levelColor(skill.level)}`}
                      aria-label={`Rate ${row.username} ${coverageSkill.skill_name} L${skill.level}`}
                    >
                      L{skill.level}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {hasMore && !showAll && (
        <div className="p-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="w-full"
            onClick={() => setShowAll(true)}
          >
            Show all {totalSkills} skills
          </Button>
        </div>
      )}
    </div>
  );
};
