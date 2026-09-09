import React from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconWell, type Tone } from "@/components/ui/IconWell";

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

const variantTone: Record<NonNullable<ConfirmDialogProps["variant"]>, Tone> = {
  destructive: "danger",
  success: "success",
  default: "neutral",
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
    <DialogContent size="sm">
      <DialogHeader>
        {icon ? (
          <div className="flex items-center gap-3">
            <IconWell tone={variantTone[variant]} size="sm" data-testid="confirm-icon-well">
              {icon}
            </IconWell>
            <DialogTitle>{title}</DialogTitle>
          </div>
        ) : (
          <DialogTitle>{title}</DialogTitle>
        )}
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {(contextSlot || children) && (
        <DialogBody>
          {contextSlot}
          {children}
        </DialogBody>
      )}
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
