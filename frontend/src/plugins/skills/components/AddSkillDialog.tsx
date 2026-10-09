/** Dialog for adding skills from the admin-managed catalog. */
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/SearchField";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogDescription,
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
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Check, Loader2, SearchX } from "lucide-react";
import {
  useSkills,
  useSkillCategories,
  useSkillLevelLabels,
  resolveLevelLabel,
} from "../hooks/useSkillsQueries";
import { PROFICIENCY_LEVELS } from "../utils/proficiencyLevels";
import { hoverLiftClass } from "@/lib/motion";

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
  const { data: levelLabels } = useSkillLevelLabels();
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
      <DialogContent size="xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add skills to your profile</DialogTitle>
          <DialogDescription>
            Select one or more skills, then set the same proficiency level for all selected skills.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="sm:divide-border grid gap-6 space-y-0 sm:grid-cols-2 sm:divide-x">
          <div className="min-w-0 space-y-3">
            <div>
              <Label htmlFor="skill-search">Search skills</Label>
              <SearchField
                id="skill-search"
                className="mt-1"
                aria-label="Search skills"
                value={search}
                onChange={setSearch}
                placeholder="Search by skill name or code..."
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

            <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
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
              <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading skills...
              </p>
            )}
            {skillsError && !skillsLoading && (
              <p role="alert" className="text-destructive text-sm">
                Could not load available skills.
              </p>
            )}
            {!skillsLoading && !skillsError && availableSkills.length > 0 && (
              <div
                className="no-scrollbar border-border max-h-64 overflow-y-auto rounded-lg border"
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
                      className={`border-border/70 hover:bg-accent flex min-h-[44px] w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 ${hoverLiftClass} ${selected ? "bg-primary/10" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={skill.name}>
                          {skill.name}
                        </span>
                        <span
                          className="text-muted-foreground block truncate text-xs"
                          title={`${skill.category_name ?? ""} · ${skill.code}`}
                        >
                          {skill.category_name} · {skill.code}
                        </span>
                      </span>
                      {selected && (
                        <Check className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {!skillsLoading && !skillsError && availableSkills.length > MAX_VISIBLE_RESULTS && (
              <p className="text-muted-foreground text-xs">
                Refine your search to see more than {MAX_VISIBLE_RESULTS} matches.
              </p>
            )}
            {!skillsLoading && !skillsError && availableSkills.length === 0 && (
              <EmptyState
                icon={SearchX}
                title="No skills available"
                description="Try a different search or category."
                action={
                  search || categoryCode !== "all" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setCategoryCode("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Selected
              </p>
              {selectedSkills.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-sm">Choose skills from the list.</p>
              ) : (
                <>
                  {selectedSkills.length === 1 && (
                    <p className="mt-2 text-sm">
                      Selected skill: <span className="font-medium">{selectedSkills[0].name}</span>
                    </p>
                  )}
                  <div className="no-scrollbar mt-2 max-h-32 space-y-1 overflow-y-auto">
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
                          className="text-muted-foreground hover:bg-accent min-h-11 min-w-11 rounded text-xs"
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
                      {item.level} - {resolveLevelLabel(item.level, levelLabels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="skill-notes">Notes (optional)</Label>
              <Textarea
                id="skill-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="mt-1 resize-none"
              />
            </div>
            <InfoCallout label="The same level applies to every selected skill." />
          </div>
        </DialogBody>
        <DialogFooter className="shrink-0 border-t pt-4">
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
