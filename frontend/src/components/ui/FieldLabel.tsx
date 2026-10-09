import * as React from "react";
import { cn } from "@/lib/utils";

interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  /** Trailing hint, right-aligned when the label fills its row. */
  hint?: React.ReactNode;
}

/**
 * Mono uppercase micro-label. The standard label for form fields, metric
 * captions and section captions. Renders a `<label>` so `htmlFor` keeps the
 * accessible-name association intact.
 */
export const FieldLabel = ({
  className,
  children,
  required = false,
  hint,
  ...props
}: FieldLabelProps) => (
  <label
    className={cn(
      "text-muted-foreground flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider uppercase",
      className
    )}
    {...props}
  >
    <span>{children}</span>
    {required && (
      <span aria-hidden="true" className="text-tone-danger-text">
        *
      </span>
    )}
    {hint && <span className="ml-auto font-normal normal-case">{hint}</span>}
  </label>
);
