import { useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Group } from "@/types";

export interface ResourceAccessGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this group instead of creating a new one. */
  editingGroup?: Group | null;
  onSubmit: (values: { name: string; code: string; description: string }) => void;
  isPending: boolean;
  errorMessage?: string | null;
}

export function ResourceAccessGroupDialog({
  open,
  onOpenChange,
  editingGroup,
  onSubmit,
  isPending,
  errorMessage,
}: ResourceAccessGroupDialogProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setName(editingGroup?.name ?? "");
      setCode(editingGroup?.code ?? "");
      setDescription(editingGroup?.description ?? "");
      // Focus the first field after the dialog opens.
      const timer = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, editingGroup]);

  const isEdit = Boolean(editingGroup);
  const canSubmit = name.trim().length > 0 && code.trim().length > 0 && !isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit group" : "Create group"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ra-group-name">Group name</Label>
            <Input
              id="ra-group-name"
              ref={nameInputRef}
              placeholder="e.g. Analytics viewers"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-group-code">Short code</Label>
            <Input
              id="ra-group-code"
              placeholder="e.g. ANALYTICS"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-group-description">Description (optional)</Label>
            <Input
              id="ra-group-description"
              placeholder="What is this group for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoComplete="off"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {isEdit ? "Save changes" : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
