/**
 * Inline per-Tech level scale editor for the admin Tech page.
 *
 * A Tech level is a grade a person holds inside that Tech (Infrastructure
 * L1/L2/L3). The scale is admin-managed here so adding a grade never needs a
 * migration.
 *
 * Reordering uses up/down buttons rather than drag-and-drop: it is keyboard
 * operable for free and needs no extra dependency. Each move posts the whole
 * new order to reorder_levels, which rewrites every rank in one transaction.
 */
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Power, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { userService } from "@/services/userService";
import type { Tech, TechLevel } from "@/types";
import { toast } from "sonner";

interface TechLevelEditorProps {
  tech: Tech;
}

export const TechLevelEditor: React.FC<TechLevelEditorProps> = ({ tech }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", code: "" });
  const [deleteTarget, setDeleteTarget] = useState<TechLevel | null>(null);
  const [renaming, setRenaming] = useState<TechLevel | null>(null);
  const [renameForm, setRenameForm] = useState({ name: "", code: "" });
  const levels = [...(tech.levels ?? [])].sort((a, b) => a.rank - b.rank);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "techs"] });
    // Profiles carry the level per assignment, and the facet chips are keyed
    // off the scale — both go stale the moment a level changes.
    queryClient.invalidateQueries({ queryKey: ["admin", "profiles"] });
  };

  const create = useMutation({
    mutationFn: () =>
      userService.createTechLevel({
        tech: tech.id,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        // Append at the end of the scale.
        rank: levels.length > 0 ? Math.max(...levels.map((l) => l.rank)) + 1 : 1,
      }),
    onSuccess: () => {
      setForm({ name: "", code: "" });
      invalidate();
      toast.success("Level added");
    },
    onError: () => toast.error("Failed to add level. Check for a duplicate name or code."),
  });

  const toggleActive = useMutation({
    mutationFn: (level: TechLevel) =>
      userService.updateTechLevel(level.id, { is_active: !level.is_active }),
    onSuccess: () => {
      invalidate();
      toast.success("Level status updated");
    },
    onError: () => toast.error("Failed to toggle level status."),
  });

  const rename = useMutation({
    mutationFn: () =>
      userService.updateTechLevel(renaming!.id, {
        name: renameForm.name.trim(),
        code: renameForm.code.trim().toUpperCase(),
      }),
    onSuccess: () => {
      setRenaming(null);
      invalidate();
      toast.success("Level renamed");
    },
    onError: () => toast.error("Failed to rename level. Check for a duplicate name or code."),
  });

  const remove = useMutation({
    mutationFn: (id: number) => userService.deleteTechLevel(id),
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
      toast.success("Level deleted");
    },
    onError: () => toast.error("Failed to delete level."),
  });

  const reorder = useMutation({
    mutationFn: (levelIds: number[]) => userService.reorderTechLevels(tech.id, levelIds),
    onSuccess: invalidate,
    onError: () => toast.error("Failed to reorder levels."),
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= levels.length) return;
    const ordered = [...levels];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    reorder.mutate(ordered.map((level) => level.id));
  };

  const isBusy = create.isPending || reorder.isPending || remove.isPending || rename.isPending;
  // Either field alone is a valid rename: a code-only correction (L3 -> LV3)
  // is as legitimate as a name change, so do not require the name to differ.
  const renameValid =
    !!renameForm.name.trim() &&
    !!renameForm.code.trim() &&
    (renameForm.name.trim() !== renaming?.name ||
      renameForm.code.trim().toUpperCase() !== renaming?.code);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Levels
        </h3>
        <span className="text-micro text-muted-foreground">
          Lowest rank first. Order sets seniority.
        </span>
      </div>

      {levels.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No levels yet. Add one below to grade people inside {tech.name}.
        </p>
      )}

      {levels.length > 0 && (
        <ul className="space-y-1.5">
          {levels.map((level, index) => (
            <li
              key={level.id}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
            >
              <span className="w-6 shrink-0 text-center font-mono text-micro text-muted-foreground">
                {level.rank}
              </span>
              {renaming?.id === level.id ? (
                <>
                  <Input
                    aria-label={`Name for ${level.code}`}
                    className="h-7 flex-1 text-sm"
                    value={renameForm.name}
                    autoFocus
                    onChange={(event) =>
                      setRenameForm({ ...renameForm, name: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && renameValid) rename.mutate();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                  <Input
                    aria-label={`Code for ${level.code}`}
                    className="h-7 w-20 shrink-0 text-sm"
                    value={renameForm.code}
                    onChange={(event) =>
                      setRenameForm({ ...renameForm, code: event.target.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && renameValid) rename.mutate();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Save rename for ${level.name}`}
                    disabled={!renameValid || rename.isPending}
                    onClick={() => rename.mutate()}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Cancel rename for ${level.name}`}
                    onClick={() => setRenaming(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm">
                    {level.name}
                    {!level.is_active && (
                      <Badge variant="secondary" className="ml-2 text-micro">
                        Inactive
                      </Badge>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-micro text-muted-foreground">
                    {level.code}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Rename ${level.name}`}
                    disabled={isBusy}
                    onClick={() => {
                      setRenaming(level);
                      setRenameForm({ name: level.name, code: level.code });
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Move ${level.name} up`}
                disabled={index === 0 || isBusy}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Move ${level.name} down`}
                disabled={index === levels.length - 1 || isBusy}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={
                  level.is_active ? `Deactivate ${level.name}` : `Activate ${level.name}`
                }
                disabled={toggleActive.isPending}
                onClick={() => toggleActive.mutate(level)}
              >
                <Power
                  className={`h-3.5 w-3.5 ${level.is_active ? "text-success" : "text-muted-foreground"}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={`Delete ${level.name}`}
                onClick={() => setDeleteTarget(level)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_7rem_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`level-name-${tech.id}`} className="text-xs">
            Level name
          </Label>
          <Input
            id={`level-name-${tech.id}`}
            className="h-8 text-sm"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`level-code-${tech.id}`} className="text-xs">
            Code
          </Label>
          <Input
            id={`level-code-${tech.id}`}
            className="h-8 text-sm"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        </div>
        <Button
          size="sm"
          onClick={() => create.mutate()}
          disabled={!form.name.trim() || !form.code.trim() || create.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add level
        </Button>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete level"
        description={`Delete ${deleteTarget?.name ?? "this level"}? People graded at this level keep their ${tech.name} assignment but become ungraded.`}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget.id)}
      />
    </div>
  );
};
