/** Dialog for adding skills from the admin-managed catalog. */
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Check, Loader2, Search } from "lucide-react";
import { useSkills, useSkillCategories } from "../hooks/useSkillsQueries";
import { PROFICIENCY_LEVELS } from "../utils/proficiencyLevels";

interface AddSkillDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (skillIds: number[], level: number, notes?: string) => void;
  existingSkillIds?: number[];
  isSubmitting?: boolean;
}

const MAX_VISIBLE_RESULTS = 50;

export const AddSkillDialog: React.FC<AddSkillDialogProps> = ({
  open,
  onClose,
  onAdd,
  existingSkillIds = [],
  isSubmitting = false,
}) => {
  const [search, setSearch] = useState("");
  const [categoryCode, setCategoryCode] = useState<string>("all");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<number>>(new Set());
  const [level, setLevel] = useState(3);
  const [notes, setNotes] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const { data: categories = [] } = useSkillCategories(true);
  const {
    data: skills = [],
    isLoading: skillsLoading,
    error: skillsError,
  } = useSkills({
    search: debouncedSearch || undefined,
    category: categoryCode !== "all" ? categoryCode : undefined,
    active: true,
  });

  const availableSkills = useMemo(
    () => skills.filter((skill) => !existingSkillIds.includes(skill.id)),
    [skills, existingSkillIds]
  );
  const visibleSkills = availableSkills.slice(0, MAX_VISIBLE_RESULTS);
  const selectedSkills = useMemo(
    () => availableSkills.filter((skill) => selectedSkillIds.has(skill.id)),
    [availableSkills, selectedSkillIds]
  );
  const visibleSkillIds = visibleSkills.map((skill) => skill.id);
  const allVisibleSelected =
    visibleSkillIds.length > 0 && visibleSkillIds.every((id) => selectedSkillIds.has(id));

  const toggleSkill = (skillId: number) => {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleSkillIds.forEach((id) => next.delete(id));
      else visibleSkillIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const resetState = () => {
    setSelectedSkillIds(new Set());
    setLevel(3);
    setNotes("");
    setSearch("");
    setCategoryCode("all");
  };

  useEffect(() => {
    if (open) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      resetState();
    }
  }, [open]);

  const handleSubmit = () => {
    if (selectedSkills.length === 0 || isSubmitting) return;
    onAdd(
      selectedSkills.map((skill) => skill.id),
      level,
      notes || undefined
    );
  };

  const handleClose = () => onClose();

  const submitLabel =
    selectedSkills.length > 0 ? `Add ${selectedSkills.length} Skills` : "Add Skill";

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add skills to your profile</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select one or more skills, then set the same proficiency level for all selected skills.
          </p>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0 space-y-3">
            <div className="relative">
              <Label htmlFor="skill-search">Search skills</Label>
              <Search
                className="pointer-events-none absolute left-3 top-[2.15rem] h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="skill-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by skill name or code..."
                className="mt-1 pl-9"
              />
            </div>
            <div>
              <Label htmlFor="skill-category">Category</Label>
              <Select value={categoryCode} onValueChange={setCategoryCode}>
                <SelectTrigger id="skill-category" className="mt-1 w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.code} value={category.code}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {availableSkills.length} available
                {selectedSkills.length > 0 && ` · ${selectedSkills.length} selected`}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllVisible}
                  disabled={!visibleSkills.length}
                >
                  {allVisibleSelected ? "Clear visible" : "Select visible"}
                </Button>
                {selectedSkills.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSkillIds(new Set())}
                  >
                    Clear all
                  </Button>
                )}
              </div>
            </div>

            {skillsLoading && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading skills...
              </p>
            )}
            {skillsError && !skillsLoading && (
              <p role="alert" className="text-sm text-destructive">
                Could not load available skills.
              </p>
            )}
            {!skillsLoading && !skillsError && availableSkills.length > 0 && (
              <div
                className="max-h-64 overflow-y-auto rounded-lg border border-border"
                aria-label="Available skills"
              >
                {visibleSkills.map((skill) => {
                  const selected = selectedSkillIds.has(skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleSkill(skill.id)}
                      aria-pressed={selected}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-border/70 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent ${selected ? "bg-primary/10" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={skill.name}>
                          {skill.name}
                        </span>
                        <span
                          className="block truncate text-xs text-muted-foreground"
                          title={`${skill.category_name ?? ""} · ${skill.code}`}
                        >
                          {skill.category_name} · {skill.code}
                        </span>
                      </span>
                      {selected && (
                        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!skillsLoading && !skillsError && availableSkills.length > MAX_VISIBLE_RESULTS && (
              <p className="text-xs text-muted-foreground">
                Refine your search to see more than {MAX_VISIBLE_RESULTS} matches.
              </p>
            )}
            {!skillsLoading && !skillsError && availableSkills.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No skills available. Try a different search or category.
              </p>
            )}
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected
              </p>
              {selectedSkills.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Choose skills from the list.</p>
              ) : (
                <>
                  {selectedSkills.length === 1 && (
                    <p className="mt-2 text-sm">
                      Selected skill: <span className="font-medium">{selectedSkills[0].name}</span>
                    </p>
                  )}
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                    {selectedSkills.map((skill) => (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate" title={skill.name}>
                          {skill.name}
                        </span>
                        <button
                          type="button"
                          className="min-h-11 min-w-11 rounded text-xs text-muted-foreground hover:bg-accent"
                          onClick={() => toggleSkill(skill.id)}
                          aria-label={`Remove ${skill.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <Label htmlFor="skill-level">Proficiency level for all selected</Label>
              <Select value={String(level)} onValueChange={(value) => setLevel(Number(value))}>
                <SelectTrigger id="skill-level" className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROFICIENCY_LEVELS.map((item) => (
                    <SelectItem key={item.level} value={String(item.level)}>
                      {item.level} - {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="skill-notes">Notes (optional)</Label>
              <Input
                id="skill-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add a note..."
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={selectedSkills.length === 0 || isSubmitting}>
            {isSubmitting ? "Adding..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
