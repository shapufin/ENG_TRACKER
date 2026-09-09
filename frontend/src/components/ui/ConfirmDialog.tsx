import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: () => void;
  isConfirming?: boolean;
  confirmLabel?: string;
  variant?: "default" | "destructive" | "success";
  /** Mockup ConfirmAction pattern: icon rendered in a tinted well next to the title. */
  icon?: React.ReactNode;
  /** Mockup ConfirmAction pattern: context callout rendered between description and children. */
  contextSlot?: React.ReactNode;
  children?: React.ReactNode;
}

const iconWellClass: Record<string, string> = {
  destructive: "border-destructive/30 bg-destructive/15 text-rose-700 dark:text-rose-400",
  success: "border-success/30 bg-success/15 text-emerald-700 dark:text-emerald-400",
  default: "border-border bg-muted/30 text-muted-foreground",
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isConfirming = false,
  confirmLabel = "Confirm",
  variant = "default",
  icon,
  contextSlot,
  children,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        {icon ? (
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              data-testid="confirm-icon-well"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${iconWellClass[variant]}`}
            >
              {icon}
            </span>
            <DialogTitle>{title}</DialogTitle>
          </div>
        ) : (
          <DialogTitle>{title}</DialogTitle>
        )}
      </DialogHeader>
      {description && <DialogDescription>{description}</DialogDescription>}
      {contextSlot}
      {children}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isConfirming}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={variant === "success" ? "default" : variant}
          onClick={onConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? "Processing..." : confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
