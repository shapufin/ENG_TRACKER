import React, { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/context/DashboardContext";

interface DashboardEditToggleProps {
  editing: boolean;
  /** Edit layout only works on the All tab; otherwise the button explains why it is off. */
  disabled: boolean;
  /** Why it is off, when something other than the section tab is the reason. */
  disabledReason?: string;
  onToggle: () => void;
  saveStatus: SaveStatus;
  onRetry: () => void;
  /** Lets the page return focus here when edit mode ends. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}

const DISABLED_HINT = "Switch to All to rearrange widgets";
/** How long "Saved" stays on screen. */
const SAVED_VISIBLE_MS = 3000;

/** Edit layout / Done toggle plus the small save status driven by the ordered save queue. */
export const DashboardEditToggle: React.FC<DashboardEditToggleProps> = ({
  editing,
  disabled,
  disabledReason = DISABLED_HINT,
  onToggle,
  saveStatus,
  onRetry,
  buttonRef,
}) => {
  const reasonId = useId();
  // "Saved" is news for a moment, not a permanent label.
  const [seenStatus, setSeenStatus] = useState(saveStatus);
  const [savedFaded, setSavedFaded] = useState(false);
  if (seenStatus !== saveStatus) {
    setSeenStatus(saveStatus);
    setSavedFaded(false);
  }
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSavedFaded(true), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  return (
    <div className="flex items-center gap-2">
      <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
        {saveStatus === "saving" && "Saving…"}
        {saveStatus === "saved" && !savedFaded && "Saved"}
        {saveStatus === "error" && (
          <>
            Couldn&apos;t save —{" "}
            <button
              type="button"
              onClick={onRetry}
              className="text-primary focus-visible:ring-focus rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
            >
              Retry
            </button>
          </>
        )}
      </span>
      {/* Edit mode is a drag-and-resize grid, which does not exist on phones (below 768px).
          The label changes (Edit layout / Done), so no aria-pressed: one signal, not two. */}
      <Button
        ref={buttonRef}
        type="button"
        variant={editing ? "default" : "outline"}
        size="control"
        className="hidden md:inline-flex"
        data-dashboard-edit-toggle
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? reasonId : undefined}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (!disabled) onToggle();
        }}
      >
        {editing ? "Done" : "Edit layout"}
      </Button>
      {disabled && (
        <span id={reasonId} className="sr-only max-md:hidden">
          {disabledReason}
        </span>
      )}
    </div>
  );
};
