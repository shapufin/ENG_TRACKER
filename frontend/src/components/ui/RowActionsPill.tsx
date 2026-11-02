/**
 * Floating row-action pill (AdminTABLE mockup adoption).
 *
 * `DataTable` renders this inside a zero-width `relative` anchor cell at a row's
 * right edge on fine pointers; the actions column collapses and the pill carries
 * its cell content. Horizontal position comes from the `--row-pill-offset` custom
 * property the row sets on mouseEnter (entry-anchored, like the mockup).
 * `bottom-[calc(100%_-_8px)]` dips the pill 8px into its own row.
 *
 * The resting fallback is `-320px`, not a small value: the pill is centred on the
 * offset with `-translate-x-1/2`, so a fallback closer to zero than half the
 * pill's own width leaves the hidden pill hanging past the table's right edge,
 * where it inflates the scroll container's `scrollWidth` and makes a table whose
 * columns fit scroll horizontally into empty space. -320px keeps a pill up to
 * ~640px wide inside the clip; the hovered position is clamped exactly by
 * `pillOffsetForEntry`, so this only governs the at-rest (invisible) position.
 *
 * Reveal is pure CSS on the `group/row` ancestor, with the same triggers as
 * RowActions. `opacity-0` (not `invisible`) keeps buttons in the tab order, so
 * keyboard-focusing one reveals the pill through `group-has-[:focus-visible]/row`.
 * Plain `focus-within` is wrong here: a mouse click focuses the row (tabIndex 0) or a
 * button, and focus-within then pins the pill open after the pointer has left.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { RowActionsPillContext } from "./RowActionsPillContext";

export const RowActionsPill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    role="toolbar"
    aria-label="Row actions"
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => e.stopPropagation()}
    className={cn(
      "absolute bottom-[calc(100%_-_8px)] left-[var(--row-pill-offset,-320px)] z-20 -translate-x-1/2",
      "bg-popover text-popover-foreground border-border shadow-pop flex items-center gap-0.5 rounded-full border px-1.5 py-1",
      "pointer-events-none opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
      "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
      "group-has-[:focus-visible]/row:pointer-events-auto group-has-[:focus-visible]/row:opacity-100",
      "[&:not(:has(button,a,[role=button]))]:hidden"
    )}
  >
    <RowActionsPillContext.Provider value={true}>{children}</RowActionsPillContext.Provider>
  </div>
);
