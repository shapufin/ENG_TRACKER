import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface RowAction {
  /** Full accessible name, e.g. "Edit user alice". Also the tooltip text. */
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
  /** Why the action is disabled; shown in a tooltip and exposed as the button description. */
  disabledReason?: string;
}

const TONE_CLASS: Record<NonNullable<RowAction["tone"]>, string> = {
  default: "",
  danger: "text-destructive",
  warning: "text-tone-warning-text",
  success: "text-tone-success-text",
};

/** Hidden until the row is hovered/focused/selected, on fine pointers only. */
const HOVER_REVEAL_CLASS =
  "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-data-[state=selected]/row:opacity-100 transition-opacity duration-150 motion-reduce:transition-none";

const RowActionButton: React.FC<{ action: RowAction }> = ({ action }) => {
  const { label, icon: Icon, onClick, tone = "default", disabled, disabledReason } = action;
  const reasonId = React.useId();
  const explained = Boolean(disabled && disabledReason);
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="control-icon-sm"
      className={TONE_CLASS[tone]}
      aria-label={label}
      aria-describedby={explained ? reasonId : undefined}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {explained ? (
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{explained ? disabledReason : label}</TooltipContent>
      {explained && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </Tooltip>
  );
};

export const RowActions: React.FC<{ actions: RowAction[]; reveal?: "hover" | "always" }> = ({
  actions,
  reveal = "hover",
}) => (
  <TooltipProvider delayDuration={200}>
    <div
      className={cn(
        "flex items-center justify-end gap-0.5",
        reveal === "hover" && HOVER_REVEAL_CLASS
      )}
    >
      {actions.map((action) => (
        <RowActionButton key={action.label} action={action} />
      ))}
    </div>
  </TooltipProvider>
);
