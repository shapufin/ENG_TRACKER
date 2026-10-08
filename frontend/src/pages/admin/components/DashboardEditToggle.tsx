import React from "react";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "@/context/DashboardContext";

interface DashboardEditToggleProps {
  editing: boolean;
  /** Edit layout only works on the All tab; otherwise the button explains why it is off. */
  disabled: boolean;
  onToggle: () => void;
  saveStatus: SaveStatus;
  onRetry: () => void;
}

const DISABLED_HINT = "Switch to All to rearrange widgets";

/** Edit layout / Done toggle plus the small save status driven by the ordered save queue. */
export const DashboardEditToggle: React.FC<DashboardEditToggleProps> = ({
  editing,
  disabled,
  onToggle,
  saveStatus,
  onRetry,
}) => (
  <div className="flex items-center gap-2">
    <span role="status" aria-live="polite" className="text-muted-foreground text-xs">
      {saveStatus === "saving" && "Saving…"}
      {saveStatus === "saved" && "Saved"}
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
    {/* Edit mode is a drag-and-resize grid, which does not exist on phones (below 768px). */}
    <Button
      type="button"
      variant={editing ? "default" : "outline"}
      size="control"
      className="hidden md:inline-flex"
      aria-disabled={disabled || undefined}
      aria-pressed={editing}
      title={disabled ? DISABLED_HINT : undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
    >
      {editing ? "Done" : "Edit layout"}
    </Button>
  </div>
);
