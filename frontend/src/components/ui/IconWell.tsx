import * as React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";

export type { Tone };

interface IconWellProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** sm = 2rem (dialog titles), md = 2.25rem (cards, list rows). */
  size?: "sm" | "md";
}

const sizeClass = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
} as const;

/**
 * Tinted square that frames a lucide icon. Decorative by definition — always
 * `aria-hidden`; the surrounding label carries the meaning.
 */
export const IconWell = ({
  tone = "neutral",
  size = "md",
  className,
  children,
  ...props
}: IconWellProps) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex shrink-0 items-center justify-center rounded-xl border",
      sizeClass[size],
      toneSurfaceClass[tone],
      className
    )}
    {...props}
  >
    {children}
  </span>
);
