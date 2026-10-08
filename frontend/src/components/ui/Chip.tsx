import * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
}

/** Toggle chip at `--control-h-sm`, soft control edge; pressed state uses the primary tone. */
const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ pressed, className, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cn(
        "focus-visible:ring-focus inline-flex h-[var(--control-h-sm)] shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        pressed
          ? "border-primary bg-primary text-primary-foreground"
          : "border-control-edge bg-card text-muted-foreground hover:border-control-edge-hover hover:text-foreground",
        className
      )}
      {...props}
    />
  )
);
Chip.displayName = "Chip";

export { Chip };
