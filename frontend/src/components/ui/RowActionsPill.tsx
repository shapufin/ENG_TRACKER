/**
 * Floating row-action pill (AdminTABLE mockup adoption).
 *
 * `DataTable` renders this inside a zero-width `relative` anchor cell at a row's
 * right edge on fine pointers; the actions column collapses and the pill carries
 * its cell content. Horizontal position comes from the `--row-pill-offset` custom
 * property the row sets on mouseEnter (entry-anchored, like the mockup).
 * `bottom-[calc(100%_-_8px)]` dips the pill 8px into its own row.
 *
 * Reveal is pure CSS on the `group/row` ancestor, with the same triggers as
 * RowActions. `opacity-0` (not `invisible`) keeps buttons in the tab order, so
 * focusing one reveals the pill through `group-focus-within/row`.
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
      "absolute bottom-[calc(100%_-_8px)] left-[var(--row-pill-offset,-140px)] z-20 -translate-x-1/2",
      "bg-popover text-popover-foreground border-border shadow-pop flex items-center gap-0.5 rounded-full border px-1.5 py-1",
      "pointer-events-none opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
      "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
      "group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100",
      "[&:not(:has(button,a,[role=button]))]:hidden"
    )}
  >
    <RowActionsPillContext.Provider value={true}>{children}</RowActionsPillContext.Provider>
  </div>
);
