import React, { useMemo } from "react";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SkillCoverage } from "../types/skills";
import { groupSkillsByCategory } from "../utils/skillMatrixSelectors";

interface SkillsColumnSelectorProps {
  coverage: SkillCoverage[];
  visibleSkillIds: Set<number>;
  onVisibleSkillIdsChange: (ids: Set<number>) => void;
}

export const SkillsColumnSelector: React.FC<SkillsColumnSelectorProps> = ({
  coverage,
  visibleSkillIds,
  onVisibleSkillIdsChange,
}) => {
  const groups = useMemo(() => groupSkillsByCategory(coverage), [coverage]);
  const visibleCount = coverage.filter((skill) => visibleSkillIds.has(skill.skill_id)).length;

  const toggleSkill = (skillId: number, checked: boolean) => {
    const next = new Set(visibleSkillIds);
    if (checked) {
      next.add(skillId);
    } else if (next.size > 1) {
      next.delete(skillId);
    }
    onVisibleSkillIdsChange(next);
  };

  const reset = () => onVisibleSkillIdsChange(new Set(coverage.map((skill) => skill.skill_id)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          <Columns3 className="mr-2 h-4 w-4" />
          Columns
          <span className="ml-1 text-xs text-muted-foreground">({visibleCount})</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(70vh,32rem)] w-80 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Visible skills</p>
            <p className="text-xs text-muted-foreground">
              Choose which skills appear in the matrix.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <fieldset key={group.name} className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.name}
              </legend>
              {group.skills.map((skill) => {
                const checked = visibleSkillIds.has(skill.skill_id);
                const onlyVisible = checked && visibleCount === 1;
                return (
                  <label
                    key={skill.skill_id}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={onlyVisible}
                      onCheckedChange={(value) => toggleSkill(skill.skill_id, value === true)}
                      aria-label={`Show ${skill.skill_name}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm" title={skill.skill_name}>
                      {skill.skill_name}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
