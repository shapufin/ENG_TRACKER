/** Employee self-service page: list, add, update, and remove own skills. */
import React, { useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Plus, Trash2, Loader2, TrendingUp, Gauge, Trophy } from "lucide-react";
import { toast } from "sonner";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import { formatDateDDMMYYYY } from "@/lib/date-format-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";
import {
  useUserSkills,
  useCreateUserSkill,
  useUpdateUserSkill,
  useDeleteUserSkill,
} from "../hooks/useSkillsQueries";
import { ProficiencyBadge } from "../components/ProficiencyBadge";
import { AddSkillDialog } from "../components/AddSkillDialog";
import { PROFICIENCY_LEVELS, levelDot, levelLabel } from "../utils/proficiencyLevels";
import type { UserSkill } from "../types/skills";

/** 5-dot level indicator (filled dots = rating level). */
const LevelDots: React.FC<{ level: number; skillName: string }> = ({ level, skillName }) => (
  <span
    className="flex shrink-0 items-center gap-1"
    role="img"
    aria-label={`${skillName}: level ${level} of 5`}
  >
    {[1, 2, 3, 4, 5].map((dot) => (
      <span
        key={dot}
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${dot <= level ? levelDot(level) : "bg-border/70"}`}
      />
    ))}
  </span>
);

export const MySkillsPage: React.FC = () => {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error, refetch } = useUserSkills();
  const createMutation = useCreateUserSkill();
  const updateMutation = useUpdateUserSkill();
  const deleteMutation = useDeleteUserSkill();
  const [removeTarget, setRemoveTarget] = useState<UserSkill | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [isAddingBatch, setIsAddingBatch] = useState(false);

  const userSkills = useMemo(() => data?.results ?? [], [data?.results]);

  // Group skills by category_name for structured display, sorted A-Z.
  const grouped = useMemo(() => {
    const groups: { name: string; skills: UserSkill[] }[] = [];
    for (const us of userSkills) {
      const catName = us.category_name ?? "Uncategorized";
      let group = groups.find((g) => g.name === catName);
      if (!group) {
        group = { name: catName, skills: [] };
        groups.push(group);
      }
      group.skills.push(us);
    }
    for (const group of groups) {
      group.skills.sort((a, b) => (a.skill_name ?? "").localeCompare(b.skill_name ?? ""));
    }
    return groups;
  }, [userSkills]);

  const handleAdd = async (skillIds: number[], level: number, notes?: string) => {
    if (!user || isAddingBatch || skillIds.length === 0) return;
    setIsAddingBatch(true);
    const results = await Promise.allSettled(
      [...new Set(skillIds)].map((skill) => createMutation.mutateAsync({ skill, level, notes }))
    );
    const failed = results.filter((result) => result.status === "rejected");
    setIsAddingBatch(false);
    if (failed.length === 0) {
      toast.success(`${skillIds.length} skill${skillIds.length === 1 ? "" : "s"} added`);
      setDialogOpen(false);
      return;
    }
    const firstFailure = failed[0];
    const message =
      firstFailure.status === "rejected"
        ? extractApiErrorMessage(firstFailure.reason, "Some skills could not be added")
        : "Some skills could not be added";
    toast.error(`${skillIds.length - failed.length} added; ${failed.length} failed. ${message}`);
  };

  const handleLevelChange = (id: number, newLevel: number) => {
    setUpdatingId(id);
    updateMutation.mutate(
      { id, data: { level: newLevel } },
      {
        onSuccess: () => {
          setUpdatingId(null);
          toast.success("Level updated");
          setSavedId(id);
          setTimeout(() => setSavedId((prev) => (prev === id ? null : prev)), 2000);
        },
        onError: () => {
          setUpdatingId(null);
          toast.error("Failed to update level");
        },
      }
    );
  };

  const handleDelete = () => {
    if (!removeTarget) return;
    setDeletingId(removeTarget.id);
    deleteMutation.mutate(removeTarget.id, {
      onSuccess: () => {
        setDeletingId(null);
        toast.success(`Removed ${removeTarget.skill_name ?? "skill"}`);
        setRemoveTarget(null);
      },
      onError: () => {
        setDeletingId(null);
        toast.error("Failed to remove skill");
      },
    });
  };

  const existingSkillIds = userSkills.map((us) => us.skill);
  const categoryCount = grouped.length;

  const avgLevel = useMemo(() => {
    if (userSkills.length === 0) return null;
    const sum = userSkills.reduce((acc, us) => acc + us.level, 0);
    return (Math.round((sum / userSkills.length) * 10) / 10).toFixed(1);
  }, [userSkills]);

  const strongestSkill = useMemo(
    () =>
      userSkills.reduce<UserSkill | null>(
        (best, us) => (best === null || us.level > best.level ? us : best),
        null
      ),
    [userSkills]
  );

  // Mockup header stamp ("Last verified"). The app tracks no verification
  // date, so the honest equivalent is the most recent rating update.
  const lastUpdatedLabel = useMemo(() => {
    const times = userSkills
      .map((us) => new Date(us.last_updated_at).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return formatDateDDMMYYYY(new Date(Math.max(...times)));
  }, [userSkills]);

  return (
    <PageShell
      title="My Skills"
      subtitle="Manage your skill proficiencies"
      category="Skills"
      actions={
        <>
          {lastUpdatedLabel && (
            <span className="mr-1 font-mono text-xs text-muted-foreground">
              Last updated: {lastUpdatedLabel}
            </span>
          )}
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> Add Skill
          </Button>
        </>
      }
    >
      {!isLoading && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <GlassCard isHoverLift={false} className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">Rated skills</span>
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {userSkills.length}
            </p>
          </GlassCard>
          <GlassCard isHoverLift={false} className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">Categories</span>
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {categoryCount}
            </p>
          </GlassCard>
          <GlassCard isHoverLift={false} className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">Average level</span>
            </div>
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {avgLevel !== null ? `L${avgLevel}` : "—"}
            </p>
          </GlassCard>
          <GlassCard isHoverLift={false} className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Trophy className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Strongest skill
              </span>
            </div>
            <p
              className="truncate font-mono text-lg font-bold text-foreground"
              title={strongestSkill?.skill_name}
            >
              {strongestSkill ? `${strongestSkill.skill_name} · L${strongestSkill.level}` : "—"}
            </p>
          </GlassCard>
        </div>
      )}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && error && !data && (
        <ErrorCard
          title="Failed to load your skills"
          message="Could not fetch your skill profile. Please check your connection and try again."
          onRetry={() => void refetch()}
        />
      )}
      {!isLoading && !error && userSkills.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No skills yet. Click "Add Skill" to get started.
          </p>
        </div>
      )}
      {!isLoading && !error && userSkills.length > 0 && (
        <div className="space-y-6">
          {grouped.map((group) => {
            return (
              <section key={group.name}>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {group.name} ({group.skills.length} skill{group.skills.length !== 1 ? "s" : ""})
                </h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {group.skills.map((us) => {
                    return (
                      <div
                        key={us.id}
                        className="grid gap-3 bg-card p-4 transition-colors duration-150 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <ProficiencyBadge level={us.level} showLabel />
                          <LevelDots level={us.level} skillName={us.skill_name ?? "skill"} />
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={us.skill_name}>
                              {us.skill_name}
                            </p>
                            <p className="text-xs text-muted-foreground" title={us.category_name}>
                              {us.category_name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={String(us.level)}
                            disabled={updatingId === us.id}
                            onValueChange={(v) => {
                              const newLevel = Number(v);
                              if (newLevel !== us.level) {
                                handleLevelChange(us.id, newLevel);
                              }
                            }}
                          >
                            <SelectTrigger className="min-h-11 w-auto min-w-[145px]">
                              <SelectValue>
                                L{us.level} - {levelLabel(us.level)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {PROFICIENCY_LEVELS.map((l) => (
                                <SelectItem key={l.level} value={String(l.level)}>
                                  {l.level} - {l.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {savedId === us.id && (
                            <span
                              role="status"
                              aria-live="polite"
                              className="shrink-0 text-xs text-emerald-600 dark:text-emerald-400"
                            >
                              ✓ Saved
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive hover:text-destructive"
                            onClick={() => setRemoveTarget(us)}
                            disabled={deletingId === us.id}
                            aria-label={`Remove ${us.skill_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove skill?"
        description={`Remove ${removeTarget?.skill_name ?? "this skill"} from your profile?`}
        confirmLabel="Remove"
        variant="destructive"
        isConfirming={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
      <AddSkillDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onAdd={handleAdd}
        existingSkillIds={existingSkillIds}
        isSubmitting={isAddingBatch}
      />
    </PageShell>
  );
};
