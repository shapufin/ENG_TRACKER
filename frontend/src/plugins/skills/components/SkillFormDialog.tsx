import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import type { Skill, SkillCategory } from "../types/skills";

interface SkillFormDialogProps {
  open: boolean;
  onClose: () => void;
  editing: Skill | null;
  categories: SkillCategory[];
  defaultCategoryId?: number | null;
  isSubmitting: boolean;
  errorMessage?: string;
  onSubmit: (data: Record<string, unknown>) => void;
}

export const SkillFormDialog: React.FC<SkillFormDialogProps> = ({
  open,
  onClose,
  editing,
  categories,
  defaultCategoryId = null,
  isSubmitting,
  errorMessage,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(editing?.name ?? "");
      setCategoryId(editing?.category ?? defaultCategoryId);
      setDescription(editing?.description ?? "");
      setIsActive(editing?.is_active ?? true);
    }
  }, [open, editing, defaultCategoryId]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent size="sm">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? "Edit Skill" : "New Skill"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the skill details. The code is auto-generated from the name."
              : "Add a new skill to the catalog. Assign it to a category so it appears in the team matrix."}
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto">
          <FormErrorBanner message={errorMessage} />
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">Name</Label>
            <Input
              id="skill-name"
              value={name}
              onChange={(event) => setName(event.target.value.toUpperCase())}
              placeholder="SKILL NAME"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground">
              Stored in uppercase. Code is derived automatically.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-cat">Category</Label>
            <Select
              value={categoryId ? String(categoryId) : ""}
              onValueChange={(value) => setCategoryId(Number(value))}
            >
              <SelectTrigger id="skill-cat" className="mt-1 w-full">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={String(category.id)}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-desc">Description</Label>
            <Textarea
              id="skill-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1"
              placeholder="Optional — describe what this skill covers"
            />
          </div>
          <div className="flex min-h-11 items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive skills are hidden from the team matrix
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Skill active" />
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                name,
                category: categoryId,
                description,
                is_active: isActive,
              })
            }
            disabled={!name.trim() || !categoryId || isSubmitting}
          >
            {isSubmitting ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
