import React, { useMemo, useState } from "react";
import { Check, FolderTree, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Switch } from "@/components/ui/switch";
import {
  TABLE_HEAD_CELL_CHECKBOX_CLASS,
  TABLE_HEAD_CELL_CLASS,
  TABLE_HEAD_ROW_CLASS,
} from "@/components/ui/tableStyles";
import { cn } from "@/lib/utils";
import type { Skill, SkillCategory } from "../types/skills";

interface SkillsCatalogWorkspaceProps {
  categories: SkillCategory[];
  skills: Skill[];
  selectedCategory: string;
  onCategoryChange: (code: string) => void;
  onCreateCategory: () => void;
  onEditCategory: (category: SkillCategory) => void;
  onDeleteCategory: (category: SkillCategory) => void;
  onCreateSkill: () => void;
  onBulkAddSkills: () => void;
  onEditSkill: (skill: Skill) => void;
  onToggleSkillActive: (skill: Skill) => void;
  onDeleteSkills: (skills: Skill[]) => void;
  isLoading?: boolean;
  isDeleting?: boolean;
  togglingId?: number | null;
  onResetFilters: () => void;
}

export const SkillsCatalogWorkspace: React.FC<SkillsCatalogWorkspaceProps> = ({
  categories,
  skills,
  selectedCategory,
  onCategoryChange,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onCreateSkill,
  onBulkAddSkills,
  onEditSkill,
  onToggleSkillActive,
  onDeleteSkills,
  isLoading = false,
  isDeleting = false,
  togglingId = null,
  onResetFilters,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedCategoryData = categories.find((category) => category.code === selectedCategory);
  const visibleSkills = useMemo(
    () =>
      selectedCategory === "all"
        ? skills
        : skills.filter((skill) => skill.category_code === selectedCategory),
    [selectedCategory, skills]
  );
  const allVisibleSelected =
    visibleSkills.length > 0 && visibleSkills.every((skill) => selectedIds.has(skill.id));

  const activeCount = visibleSkills.filter((skill) => skill.is_active).length;
  const inactiveCount = visibleSkills.length - activeCount;

  const toggleSkill = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleSkills.forEach((skill) => next.delete(skill.id));
      else visibleSkills.forEach((skill) => next.add(skill.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const selectedSkills = visibleSkills.filter((skill) => selectedIds.has(skill.id));

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* ─── Category sidebar ─── */}
      <GlassCard className="h-fit p-3 lg:sticky lg:top-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
              <FolderTree className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">Categories</p>
              <p className="text-muted-foreground text-xs">{categories.length} total</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onCreateCategory}
            aria-label="New category"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <FilterChipRow
          label="Category"
          selected={[selectedCategory]}
          onToggle={onCategoryChange}
          options={[
            { value: "all", label: "All skills", count: skills.length, icon: Sparkles },
            ...categories.map((category) => ({
              value: category.code,
              label: category.name,
              count: category.skill_count ?? 0,
            })),
          ]}
        />
      </GlassCard>

      {/* ─── Skill list panel ─── */}
      <GlassCard className="min-w-0 p-0">
        {/* Header with title + actions */}
        <div className="border-border/70 flex flex-wrap items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Skill catalog</p>
            <h2
              className="truncate text-xl font-semibold"
              title={selectedCategoryData?.name ?? "All skills"}
            >
              {selectedCategoryData?.name ?? "All skills"}
            </h2>
            {selectedCategoryData?.description && (
              <p className="text-muted-foreground mt-1 text-sm">
                {selectedCategoryData.description}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategoryData && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => onEditCategory(selectedCategoryData)}
                aria-label={`Edit category ${selectedCategoryData.name}`}
              >
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Edit category
              </Button>
            )}
            {selectedCategoryData && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive min-h-11"
                onClick={() => onDeleteCategory(selectedCategoryData)}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Delete category
              </Button>
            )}
            <Button type="button" variant="outline" className="min-h-11" onClick={onBulkAddSkills}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add multiple
            </Button>
            <Button type="button" className="min-h-11" onClick={onCreateSkill}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add skill
            </Button>
          </div>
        </div>

        {/* Stats + selection bar */}
        <div className="border-border/70 bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={toggleVisible}
              disabled={!visibleSkills.length || isDeleting}
              aria-label={allVisibleSelected ? "Clear visible skills" : "Select all visible skills"}
              className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                allVisibleSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-muted-foreground">
              {visibleSkills.length} skill{visibleSkills.length === 1 ? "" : "s"}
            </span>
            {visibleSkills.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-success inline-flex items-center gap-1">
                  <span className="bg-success h-1.5 w-1.5 rounded-full" aria-hidden="true" />
                  {activeCount} active
                </span>
                {inactiveCount > 0 && (
                  <span className="text-muted-foreground inline-flex items-center gap-1">
                    <span
                      className="bg-muted-foreground/50 h-1.5 w-1.5 rounded-full"
                      aria-hidden="true"
                    />
                    {inactiveCount} inactive
                  </span>
                )}
              </span>
            )}
            {selectedSkills.length > 0 && (
              <span className="bg-primary/10 text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                {selectedSkills.length} selected
              </span>
            )}
          </div>
          {selectedSkills.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={clearSelection}
                disabled={isDeleting}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-11"
                onClick={() => onDeleteSkills(selectedSkills)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Delete selected
              </Button>
            </div>
          )}
        </div>

        {/* Skill list — table on desktop, card list on mobile */}
        {isLoading ? (
          <p role="status" className="text-muted-foreground flex items-center gap-2 p-8 text-sm">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Loading skills...
          </p>
        ) : visibleSkills.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No skills here yet"
            description="Add your first skill to start building this category."
            action={
              <>
                <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
                  Show all skills
                </Button>
                <Button type="button" size="sm" onClick={onCreateSkill}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Add skill
                </Button>
              </>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className={cn(TABLE_HEAD_CELL_CHECKBOX_CLASS, "w-12 px-3 text-center")}>
                      <span className="sr-only">Select</span>
                    </th>
                    <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3")}>Skill</th>
                    <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3")}>Status</th>
                    <th className={cn(TABLE_HEAD_CELL_CLASS, "px-3 text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-border/50 divide-y">
                  {visibleSkills.map((skill) => (
                    <tr
                      key={skill.id}
                      className={`transition-colors duration-150 ${
                        selectedIds.has(skill.id) ? "bg-primary/5" : "hover:bg-table-hover"
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          aria-pressed={selectedIds.has(skill.id)}
                          aria-label={`Select ${skill.name}`}
                          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                            selectedIds.has(skill.id) ? "" : "hover:bg-accent"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                              selectedIds.has(skill.id)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border"
                            }`}
                          >
                            {selectedIds.has(skill.id) && (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            )}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium" title={skill.name}>
                          {skill.name}
                        </p>
                        <p className="text-muted-foreground text-xs" title={skill.code}>
                          {skill.code}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={skill.is_active}
                            onCheckedChange={() => onToggleSkillActive(skill)}
                            disabled={isDeleting || togglingId === skill.id}
                            aria-label={`${skill.is_active ? "Deactivate" : "Activate"} ${skill.name}`}
                          />
                          <Badge
                            variant={skill.is_active ? "default" : "secondary"}
                            className={
                              skill.is_active
                                ? "border-emerald-600/30 bg-emerald-600/15 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300"
                                : ""
                            }
                          >
                            {skill.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => onEditSkill(skill)}
                            aria-label={`Edit skill ${skill.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-9"
                            onClick={() => onDeleteSkills([skill])}
                            aria-label={`Delete skill ${skill.name}`}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="space-y-2 p-3 sm:hidden">
              {visibleSkills.map((skill) => (
                <div
                  key={skill.id}
                  className={`rounded-lg border p-3 transition-colors duration-150 ${
                    selectedIds.has(skill.id)
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium" title={skill.name}>
                        {skill.name}
                      </p>
                      <p className="text-muted-foreground text-xs" title={skill.code}>
                        {skill.code}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      aria-pressed={selectedIds.has(skill.id)}
                      aria-label={`Select ${skill.name}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                          selectedIds.has(skill.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {selectedIds.has(skill.id) && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={skill.is_active}
                        onCheckedChange={() => onToggleSkillActive(skill)}
                        disabled={isDeleting || togglingId === skill.id}
                        aria-label={`${skill.is_active ? "Deactivate" : "Activate"} ${skill.name}`}
                      />
                      <Badge
                        variant={skill.is_active ? "default" : "secondary"}
                        className={
                          skill.is_active
                            ? "border-emerald-600/30 bg-emerald-600/15 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-300"
                            : ""
                        }
                      >
                        {skill.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => onEditSkill(skill)}
                        aria-label={`Edit skill ${skill.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-9 w-9"
                        onClick={() => onDeleteSkills([skill])}
                        aria-label={`Delete skill ${skill.name}`}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
};
