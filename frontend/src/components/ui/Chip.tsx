import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
}

/**
 * Toggle chip: 28px tall, soft fill. The AdminGUI mockup treatment — a quiet
 * `bg-muted` chip with no border box at rest, and a soft primary tint (not a
 * solid fill) when pressed; the lift's original version was a 32px solid-indigo
 * pill, which read as the loudest thing on the filter row. In forced-colors mode
 * the fill is dropped by the browser, so a pressed chip gets Highlight colours
 * and a check glyph. A count inside the chip inherits the chip's text colour at
 * full opacity (muted-foreground or primary, both >= 4.5:1): never dim it with
 * an opacity class.
 */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ pressed, className, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        "focus-visible:ring-focus inline-flex h-7 shrink-0 cursor-pointer touch-manipulation items-center gap-1 rounded-lg border border-transparent px-2.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        pressed
          ? "border-primary/30 bg-primary/10 text-primary forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none"
          : "bg-muted text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {pressed && <Check aria-hidden="true" className="hidden h-3.5 w-3.5 forced-colors:block" />}
      {children}
    </button>
  )
);
Chip.displayName = "Chip";

export { Chip };
