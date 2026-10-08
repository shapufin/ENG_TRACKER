import React from "react";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Class the grid uses as its drag handle: only the grip button starts a drag. */
export const GRIP_CLASS = "dashboard-grid-grip";
/** Controls inside a cell that must never start a drag. */
export const NO_DRAG_CLASS = "dashboard-grid-nodrag";

interface WidgetShellProps {
  id: string;
  title: string;
  /** Edit mode: shows the grip and remove controls. */
  editing: boolean;
  onRemove: () => void;
  onGripKeyDown: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
}

const iconButton =
  "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-focus inline-flex h-6 w-6 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-hidden";

/**
 * Wraps one widget in a grid cell. Outside edit mode it is invisible; in edit mode it adds a
 * floating grip (drag, or Alt+Arrow / Alt+Shift+Arrow) and a remove button above the card, so
 * the card itself (and its `data-chart-section`, which PDF export looks for) is untouched.
 */
export const WidgetShell: React.FC<WidgetShellProps> = ({
  id,
  title,
  editing,
  onRemove,
  onGripKeyDown,
  children,
}) => (
  <div data-widget-shell={id} className="relative h-full min-h-0">
    {editing && (
      <div className="border-border bg-card shadow-card absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded-full border p-0.5">
        <button
          type="button"
          aria-label={`Move ${title}`}
          title="Drag to move. Alt+Arrow moves, Alt+Shift+Arrow resizes."
          onKeyDown={onGripKeyDown}
          className={cn(iconButton, GRIP_CLASS, "cursor-grab touch-none active:cursor-grabbing")}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove ${title}`}
          onClick={onRemove}
          className={cn(iconButton, NO_DRAG_CLASS)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )}
    <div
      className={cn(
        "h-full min-h-0 *:h-full",
        editing && "ring-primary/40 rounded-xl ring-2 ring-offset-0"
      )}
    >
      {children}
    </div>
  </div>
);
