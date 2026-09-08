/** Admin/HR catalog management page for skill categories and skills. */
import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/StatCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, CircleOff, FolderTree, Plus, RotateCcw, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "sonner";
import { extractApiErrorMessage } from "@/lib/apiFormError";
import {
  useSkillCategories,
  useCreateSkillCategory,
  useUpdateSkillCategory,
  useDeleteSkillCategory,
  useSkills,
  useCreateSkill,
  useUpdateSkill,
} from "../hooks/useSkillsQueries";
import { skillService } from "../services/skillsService";
import type { Skill, SkillCategory } from "../types/skills";
import { SkillCategoryDialog } from "../components/SkillCategoryDialog";
import { SkillFormDialog } from "../components/SkillFormDialog";
import { SkillsCatalogWorkspace } from "../components/SkillsCatalogWorkspace";
import {
  BulkSkillAddDialog,
  type BulkSkillAddResult,
  type BulkSkillDraft,
} from "../components/BulkSkillAddDialog";

export const SkillsCatalogPage: React.FC = () => {
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [bulkSkillDialogOpen, setBulkSkillDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<SkillCategory | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [skillSearch, setSkillSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "category" | "skill";
    ids: number[];
    name: string;
  } | null>(null);
  const [categoryFormError, setCategoryFormError] = useState<string>();
  const [skillFormError, setSkillFormError] = useState<string>();
  const debouncedSkillSearch = useDebouncedValue(skillSearch, 250);

  const categoriesQuery = useSkillCategories();
  const skillsQuery = useSkills({
    search: debouncedSkillSearch || undefined,
    active: statusFilter === "all" ? undefined : statusFilter === "active",
  });
  const categories = categoriesQuery.data ?? [];
  const skills = skillsQuery.data ?? [];

  const createCat = useCreateSkillCategory();
  const updateCat = useUpdateSkillCategory();
  const deleteCat = useDeleteSkillCategory();
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const queryClient = useQueryClient();
  const batchDeleteSkill = useMutation({ mutationFn: skillService.delete });
  const batchCreateSkill = useMutation({ mutationFn: skillService.create });
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const resetFilters = () => {
    setSelectedCategory("all");
    setSkillSearch("");
    setStatusFilter("all");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "category") {
      deleteCat.mutate(deleteTarget.ids[0], {
        onSuccess: () => {
          toast.success("Category deleted");
          setDeleteTarget(null);
        },
        onError: (error) => {
          toast.error(
            extractApiErrorMessage(error, "Cannot delete a category that still contains skills")
          );
          setDeleteTarget(null);
        },
      });
      return;
    }

    const results = await Promise.allSettled(
      deleteTarget.ids.map((id) => batchDeleteSkill.mutateAsync(id))
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    const succeeded = results.length - failed;
    if (failed === 0) toast.success(`${succeeded} skill${succeeded === 1 ? "" : "s"} deleted`);
    else
      toast.error(
        `${succeeded} deleted; ${failed} failed. Skills with ratings must be deactivated.`
      );
    void queryClient.invalidateQueries({ queryKey: ["skills"] });
    setDeleteTarget(null);
  };

  const handleDeleteSkills = (items: Skill[]) => {
    setDeleteTarget({
      kind: "skill",
      ids: items.map((item) => item.id),
      name: items.length === 1 ? items[0].name : `${items.length} selected skills`,
    });
  };

  const handleBulkAdd = async (rows: BulkSkillDraft[]): Promise<BulkSkillAddResult> => {
    const results = await Promise.allSettled(rows.map((row) => batchCreateSkill.mutateAsync(row)));
    const failedRows = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            {
              index,
              name: rows[index].name,
              message: extractApiErrorMessage(result.reason, "Could not save this skill"),
            },
          ]
        : []
    );
    void queryClient.invalidateQueries({ queryKey: ["skills"] });
    if (failedRows.length === 0) {
      toast.success(`${rows.length} skill${rows.length === 1 ? "" : "s"} added`);
      setBulkSkillDialogOpen(false);
      return { failedRows: [] };
    }
    toast.error(`${rows.length - failedRows.length} added; ${failedRows.length} failed.`);
    return { failedRows };
  };

  const handleToggleSkillActive = (skill: Skill) => {
    if (togglingId !== null) return;
    setTogglingId(skill.id);
    updateSkill.mutate(
      { id: skill.id, data: { is_active: !skill.is_active } },
      {
        onSuccess: () => {
          setTogglingId(null);
          toast.success(`${skill.name} ${skill.is_active ? "deactivated" : "activated"}`);
        },
        onError: (error) => {
          setTogglingId(null);
          toast.error(extractApiErrorMessage(error, "Failed to update skill status"));
        },
      }
    );
  };

  return (
    <PageShell
      title="Skills Catalog"
      subtitle="Manage skill categories and catalog items"
      category="Admin"
      actions={
        <Button
          size="sm"
          onClick={() => {
            setEditingSkill(null);
            setSkillFormError(undefined);
            setSkillDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New skill
        </Button>
      }
    >
      {categoriesQuery.error && !categories.length && (
        <ErrorCard
          title="Failed to load skill categories"
          message="Could not fetch the catalog categories."
          onRetry={() => void categoriesQuery.refetch()}
        />
      )}
      {skillsQuery.error && !skills.length && (
        <ErrorCard
          title="Failed to load skills"
          message="Could not fetch the skill catalog."
          onRetry={() => void skillsQuery.refetch()}
        />
      )}

      {/* Stats summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Categories" value={categories.length} icon={FolderTree} />
        <StatCard label="Total skills" value={skills.length} icon={Search} />
        <StatCard
          label="Active"
          value={skills.filter((s) => s.is_active).length}
          icon={CheckCircle2}
          glow="success"
          iconColorClass="text-success"
          valueColorClass="text-success"
        />
        <StatCard
          label="Inactive"
          value={skills.filter((s) => !s.is_active).length}
          icon={CircleOff}
          iconColorClass="text-muted-foreground"
          valueColorClass="text-muted-foreground"
        />
      </div>

      {/* Filter bar */}
      <GlassCard
        isHoverLift={false}
        className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <Label htmlFor="catalog-search">Search catalog</Label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="catalog-search"
              value={skillSearch}
              onChange={(event) => setSkillSearch(event.target.value)}
              placeholder="Search by skill name or code..."
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-[160px]">
            <Label htmlFor="catalog-status">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
            >
              <SelectTrigger id="catalog-status" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={resetFilters}
            disabled={selectedCategory === "all" && !skillSearch && statusFilter === "all"}
          >
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reset
          </Button>
        </div>
      </GlassCard>

      {!skillsQuery.error && (
        <SkillsCatalogWorkspace
          categories={categories}
          skills={skills}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          onCreateCategory={() => {
            setEditingCat(null);
            setCategoryFormError(undefined);
            setCatDialogOpen(true);
          }}
          onEditCategory={(category) => {
            setEditingCat(category);
            setCategoryFormError(undefined);
            setCatDialogOpen(true);
          }}
          onDeleteCategory={(category) =>
            setDeleteTarget({ kind: "category", ids: [category.id], name: category.name })
          }
          onCreateSkill={() => {
            setEditingSkill(null);
            setSkillFormError(undefined);
            setSkillDialogOpen(true);
          }}
          onBulkAddSkills={() => {
            if (selectedCategory === "all") {
              toast.error("Select a category before adding multiple skills");
            } else {
              setBulkSkillDialogOpen(true);
            }
          }}
          onEditSkill={(skill) => {
            setEditingSkill(skill);
            setSkillFormError(undefined);
            setSkillDialogOpen(true);
          }}
          onToggleSkillActive={handleToggleSkillActive}
          onDeleteSkills={handleDeleteSkills}
          isLoading={skillsQuery.isLoading}
          isDeleting={batchDeleteSkill.isPending}
          togglingId={togglingId}
          onResetFilters={resetFilters}
        />
      )}

      <BulkSkillAddDialog
        open={bulkSkillDialogOpen}
        category={categories.find((category) => category.code === selectedCategory) ?? null}
        existingSkills={skills.filter((skill) => skill.category_code === selectedCategory)}
        isSubmitting={batchCreateSkill.isPending}
        onClose={() => setBulkSkillDialogOpen(false)}
        onSubmit={handleBulkAdd}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.kind ?? "item"}?`}
        description={`Delete ${deleteTarget?.name ?? "this item"}? Skills with active ratings cannot be deleted; deactivate them instead.`}
        confirmLabel="Delete"
        variant="destructive"
        isConfirming={deleteCat.isPending || batchDeleteSkill.isPending}
        onConfirm={handleDeleteConfirm}
      />

      <SkillCategoryDialog
        open={catDialogOpen}
        onClose={() => {
          setCatDialogOpen(false);
          setCategoryFormError(undefined);
        }}
        editing={editingCat}
        isSubmitting={createCat.isPending || updateCat.isPending}
        errorMessage={categoryFormError}
        onSubmit={(data) => {
          setCategoryFormError(undefined);
          const options = {
            onSuccess: () => {
              toast.success(editingCat ? "Category updated" : "Category created");
              setCatDialogOpen(false);
            },
            onError: (error: unknown) => {
              const message = extractApiErrorMessage(
                error,
                `Failed to ${editingCat ? "update" : "create"} category`
              );
              setCategoryFormError(message);
              toast.error(message);
            },
          };
          if (editingCat) updateCat.mutate({ id: editingCat.id, data }, options);
          else createCat.mutate(data, options);
        }}
      />

      <SkillFormDialog
        open={skillDialogOpen}
        onClose={() => {
          setSkillDialogOpen(false);
          setSkillFormError(undefined);
        }}
        editing={editingSkill}
        categories={categories}
        defaultCategoryId={
          selectedCategory === "all"
            ? null
            : (categories.find((c) => c.code === selectedCategory)?.id ?? null)
        }
        isSubmitting={createSkill.isPending || updateSkill.isPending}
        errorMessage={skillFormError}
        onSubmit={(data) => {
          setSkillFormError(undefined);
          const options = {
            onSuccess: () => {
              toast.success(editingSkill ? "Skill updated" : "Skill created");
              setSkillDialogOpen(false);
            },
            onError: (error: unknown) => {
              const message = extractApiErrorMessage(
                error,
                `Failed to ${editingSkill ? "update" : "create"} skill`
              );
              setSkillFormError(message);
              toast.error(message);
            },
          };
          if (editingSkill) updateSkill.mutate({ id: editingSkill.id, data }, options);
          else createSkill.mutate(data, options);
        }}
      />
    </PageShell>
  );
};
