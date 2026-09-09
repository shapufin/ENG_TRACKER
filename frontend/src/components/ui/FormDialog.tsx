import React from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  type DialogSize,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** Extra submit disable rule (e.g. form validation). Affects only submit. */
  submitDisabled?: boolean;
  /** Dialog width. Defaults to "lg" (672px) — enough room for 2-column forms. */
  size?: DialogSize;
}

export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Save",
  submitDisabled = false,
  size = "lg",
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent size={size} aria-describedby={undefined}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Scrollable body — keeps header + footer always visible */}
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || submitDisabled}>
            {isSubmitting ? "Saving..." : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);
