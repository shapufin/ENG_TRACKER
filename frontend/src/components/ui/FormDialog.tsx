import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  /** Override the dialog max-width. Defaults to "sm:max-w-lg". */
  contentClassName?: string;
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
  contentClassName,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn(
        "flex max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-1rem)] flex-col overflow-hidden sm:max-h-[90vh]",
        contentClassName ?? "sm:max-w-lg"
      )}
      aria-describedby={undefined}
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Scrollable body — keeps header + footer always visible */}
        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
          {children}
        </div>
        <DialogFooter className="shrink-0 border-t pt-4">
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
