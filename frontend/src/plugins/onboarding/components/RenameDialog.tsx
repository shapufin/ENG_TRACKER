import React, { useState } from "react";
import { FormDialog } from "@/components/ui/FormDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onRename: (name: string) => Promise<void>;
}

/** Caller must remount this on target change (e.g. `key={target?.id}`) so
 * `name` initializes from the new `currentName` — no effect needed. */
export const RenameDialog: React.FC<RenameDialogProps> = ({
  open,
  onOpenChange,
  currentName,
  onRename,
}) => {
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onRename(name.trim());
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename"
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Rename"
      submitDisabled={!name.trim() || name.trim() === currentName}
      size="sm"
    >
      <Label htmlFor="onboarding-rename-name">Name</Label>
      <Input
        id="onboarding-rename-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
    </FormDialog>
  );
};
