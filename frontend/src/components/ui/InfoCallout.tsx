import * as React from "react";
import { cn } from "@/lib/utils";
import { toneSurfaceClass, type Tone } from "@/components/ui/tone";

interface InfoCalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  /** Left-hand caption. */
  label: React.ReactNode;
  /** Right-hand emphasised value (rendered mono/tabular). */
  value?: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * Tinted context row — the "Allowance Remaining · 16.0 days" pattern. Use for
 * read-only context inside dialogs and cards; use `EmptyState` for empty
 * collections and `ErrorCard` for failures.
 */
export const InfoCallout = ({
  tone = "info",
  label,
  value,
  icon,
  className,
  children,
  ...props
}: InfoCalloutProps) => (
  <div
    className={cn(
      "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
      toneSurfaceClass[tone],
      className
    )}
    {...props}
  >
    {icon && (
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
    )}
    <span className="min-w-0 flex-1">{label}</span>
    {value !== undefined && (
      <span className="shrink-0 font-mono font-bold tabular-nums">{value}</span>
    )}
    {children}
  </div>
);
