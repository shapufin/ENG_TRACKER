import React from "react";
import { levelColor } from "../utils/proficiencyLevels";
import { getTopRatedSkills } from "../utils/skillMatrixSelectors";
import type { TeamMatrixRow } from "../types/skills";
import { SkillsMemberCell } from "./SkillsMemberCell";

export interface SkillRateTarget {
  userSkillId: number;
  username: string;
  skillName: string;
  currentLevel: number;
}

interface SkillsMemberListProps {
  rows: TeamMatrixRow[];
  onRate: (target: SkillRateTarget) => void;
}

export const SkillsMemberList: React.FC<SkillsMemberListProps> = ({ rows, onRate }) => (
  <div className="grid gap-3 md:grid-cols-2">
    {rows.map((row) => {
      const topSkills = getTopRatedSkills(row, 5);
      return (
        <article key={row.user_id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <SkillsMemberCell row={row} className="min-w-0" />
            <span className="shrink-0 text-xs text-muted-foreground">
              {row.skills.length} rated skills
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {topSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills rated yet.</p>
            ) : (
              topSkills.map((skill) => (
                <div
                  key={skill.user_skill_id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm" title={skill.skill_name}>
                    {skill.skill_name}
                  </span>
                  <button
                    type="button"
                    className={`min-h-11 min-w-11 rounded border px-2 text-xs font-semibold ${levelColor(skill.level)}`}
                    aria-label={`Rate ${row.username} ${skill.skill_name} L${skill.level}`}
                    onClick={() =>
                      onRate({
                        userSkillId: skill.user_skill_id,
                        username: row.username,
                        skillName: skill.skill_name,
                        currentLevel: skill.level,
                      })
                    }
                  >
                    L{skill.level}
                  </button>
                </div>
              ))
            )}
          </div>
        </article>
      );
    })}
  </div>
);
