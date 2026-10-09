import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
}

/**
 * Toggle chip at `--control-h-sm`, soft control edge; pressed state uses the primary tone. In forced-colors
 * mode the fill is dropped by the browser, so a pressed chip gets Highlight colours and a check glyph.
 * A count inside the chip inherits the chip's text colour at full opacity (muted-foreground or
 * primary-foreground, both >= 4.5:1): never dim it with an opacity class.
 */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ pressed, className, type = "button", children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        "focus-visible:ring-focus inline-flex h-[var(--control-h-sm)] shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        pressed
          ? "border-primary bg-primary text-primary-foreground forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none"
          : "border-control-edge bg-card text-muted-foreground hover:border-control-edge-hover hover:text-foreground",
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
