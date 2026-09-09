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
import { FormErrorBanner } from "@/components/common/forms/FormErrorBanner";
import type { SkillCategory } from "../types/skills";

interface SkillCategoryDialogProps {
  open: boolean;
  onClose: () => void;
  editing: SkillCategory | null;
  isSubmitting: boolean;
  errorMessage?: string;
  onSubmit: (data: Record<string, unknown>) => void;
}

export const SkillCategoryDialog: React.FC<SkillCategoryDialogProps> = ({
  open,
  onClose,
  editing,
  isSubmitting,
  errorMessage,
  onSubmit,
}) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(editing?.name ?? "");
      setDescription(editing?.description ?? "");
      setIsActive(editing?.is_active ?? true);
    }
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-md flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the category name or description. The code is auto-generated."
              : "Create a new skill category to group related skills. The code is auto-generated from the name."}
          </DialogDescription>
        </DialogHeader>
        <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto">
          <FormErrorBanner message={errorMessage} />
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(event) => setName(event.target.value.toUpperCase())}
              placeholder="CATEGORY NAME"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground">
              Stored in uppercase. Code is derived automatically.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1"
              placeholder="Optional — describe what this category covers"
            />
          </div>
          <div className="flex min-h-11 items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive categories are hidden from the team view
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Category active" />
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
                description,
                is_active: isActive,
              })
            }
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Saving..." : editing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
