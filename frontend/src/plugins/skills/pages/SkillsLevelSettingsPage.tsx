/**
 * SkillsLevelSettingsPage — rename the L1-L5 proficiency labels shown
 * throughout the Skills plugin (matrix, ratings, legends). Modeled on
 * PayrollSettingsPage's config fetch/override/save pattern.
 */
import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingCard } from "@/components/ui/LoadingCard";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { usePluginPermissions } from "@/hooks/usePluginPermissions";
import { toast } from "sonner";
import { handleApiError } from "@/lib/error-handler";
import { useSkillLevelLabels, useUpdateSkillLevelLabels } from "../hooks/useSkillsQueries";
import { PROFICIENCY_LEVELS } from "../utils/proficiencyLevels";
import type { SkillLevelLabels } from "../types/skills";

const LEVEL_FIELDS = [1, 2, 3, 4, 5] as const;

type LevelLabelField = `level_${(typeof LEVEL_FIELDS)[number]}_label`;

const fieldFor = (level: number) => `level_${level}_label` as LevelLabelField;

export const SkillsLevelSettingsPage: React.FC = () => {
  const { canConfigure } = usePluginPermissions();
  const canConfigureSkills = canConfigure("skills");
  const { data: labels, isLoading, error, refetch } = useSkillLevelLabels();
  const updateMutation = useUpdateSkillLevelLabels();

  const [overrides, setOverrides] = useState<Partial<SkillLevelLabels>>({});

  const form = useMemo<Partial<SkillLevelLabels>>(
    () => ({ ...labels, ...overrides }),
    [labels, overrides]
  );

  const updateField = (level: number, value: string) => {
    setOverrides((prev) => ({ ...prev, [fieldFor(level)]: value }));
  };

  const resetToDefaults = () => {
    const defaults: Partial<SkillLevelLabels> = {};
    for (const level of LEVEL_FIELDS) {
      const entry = PROFICIENCY_LEVELS.find((l) => l.level === level);
      defaults[fieldFor(level)] = entry?.label ?? "";
    }
    setOverrides(defaults);
  };

  const save = () => {
    updateMutation.mutate(overrides, {
      onSuccess: () => {
        setOverrides({});
        toast.success("Proficiency level names saved");
      },
      onError: (err) => handleApiError(err),
    });
  };

  if (isLoading) return <LoadingCard rows={3} className="min-h-[200px]" />;
  if (error || !labels)
    return <ErrorCard title="Failed to load proficiency level names" onRetry={refetch} />;

  return (
    <PageShell
      title="Proficiency Level Names"
      subtitle="Rename L1-L5 to match how your organization talks about skill levels."
      actions={
        canConfigureSkills ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetToDefaults} disabled={updateMutation.isPending}>
              Reset to defaults
            </Button>
            <Button
              onClick={save}
              disabled={updateMutation.isPending || Object.keys(overrides).length === 0}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <GlassCard className="p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          These names appear next to the L1-L5 numbers on the Skills Matrix, rating dialogs, and
          legends. The level numbers themselves always stay 1 through 5.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LEVEL_FIELDS.map((level) => (
            <div key={level}>
              <Label htmlFor={`level-${level}-label`}>Level {level}</Label>
              <Input
                id={`level-${level}-label`}
                value={form[fieldFor(level)] ?? ""}
                onChange={(e) => updateField(level, e.target.value)}
                disabled={!canConfigureSkills}
                placeholder={PROFICIENCY_LEVELS.find((l) => l.level === level)?.label}
              />
            </div>
          ))}
        </div>
      </GlassCard>
    </PageShell>
  );
};
