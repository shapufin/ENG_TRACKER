import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RowActionsPillContext } from "./RowActionsPillContext";

export interface RowAction {
  /** Full accessible name, e.g. "Edit user alice". Also the tooltip text. */
  label: string;
  /** Short pill-only label, e.g. "Edit". Rendered next to the icon inside
   * the floating RowActionsPill on wide screens (hidden below `xl`, like the
   * AdminTABLE mockup); the actions column stays icon-only. */
  shortLabel?: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
  /** Why the action is disabled; shown in a tooltip and exposed as the button description. */
  disabledReason?: string;
}

/**
 * Idle colour + hover treatment per tone. The default action sits quiet
 * (`text-muted-foreground`, soft `bg-muted` hover — the AdminGUI mockup
 * language); destructive/warning/success keep their status colour and gain a
 * matching tinted hover well. The hover utilities override the ghost variant's
 * `hover:bg-accent/70` because `className` is merged last.
 */
const TONE_CLASS: Record<NonNullable<RowAction["tone"]>, string> = {
  default: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "text-destructive hover:bg-tone-danger-surface",
  warning: "text-tone-warning-text hover:bg-tone-warning-surface",
  success: "text-tone-success-text hover:bg-tone-success-surface",
};

/** Hidden until the row is hovered/focused/selected, on fine pointers only. */
const HOVER_REVEAL_CLASS =
  "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100 pointer-fine:group-data-[state=selected]/row:opacity-100 transition-opacity duration-150 motion-reduce:transition-none";

const RowActionButton: React.FC<{ action: RowAction }> = ({ action }) => {
  const {
    label,
    shortLabel,
    icon: Icon,
    onClick,
    tone = "default",
    disabled,
    disabledReason,
  } = action;
  const reasonId = React.useId();
  const explained = Boolean(disabled && disabledReason);
  // Pill-only text labels: the fixed-square icon size cannot hold text, so a
  // labelled pill action uses the auto-width control-sm size instead.
  const showLabel = React.useContext(RowActionsPillContext) && Boolean(shortLabel);
  const button = (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "control-sm" : "control-icon-sm"}
      className={cn(TONE_CLASS[tone], showLabel && "gap-1 whitespace-nowrap")}
      aria-label={label}
      aria-describedby={explained ? reasonId : undefined}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {showLabel && <span className="hidden text-xs font-medium xl:inline">{shortLabel}</span>}
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
