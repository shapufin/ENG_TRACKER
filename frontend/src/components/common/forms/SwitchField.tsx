import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SwitchFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Optional accessible name override when the visible label is intentionally concise. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Canonical boolean form field: a labeled Switch in a bordered toggle row.
 * The label is associated with the switch (accessible name + click target);
 * the optional description explains what the toggle controls.
 */
export const SwitchField: React.FC<SwitchFieldProps> = ({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  ariaLabel,
  className,
}) => (
  <div
    className={cn(
      "flex items-center justify-between gap-4 rounded-lg border border-border/70 p-3",
      className
    )}
  >
    <div className="min-w-0">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
    </div>
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className="shrink-0"
    />
  </div>
);
