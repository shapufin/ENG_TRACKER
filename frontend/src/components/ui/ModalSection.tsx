import * as React from "react";
import { cn } from "@/lib/utils";

interface ModalSectionProps extends Omit<React.HTMLAttributes<HTMLFieldSetElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Field columns at >= sm. Always collapses to 1 on mobile. */
  columns?: 1 | 2;
}

const columnClass = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
} as const;

/**
 * Grouped, grid-laid form fields inside a dialog. Replaces the plain
 * `<div className="space-y-4">` stacks that render as tall single columns.
 * A field that must span the full width gets `className="sm:col-span-2"`.
 */
export const ModalSection = ({
  title,
  description,
  columns = 2,
  className,
  children,
  ...props
}: ModalSectionProps) => (
  <fieldset className={cn("min-w-0 space-y-3", className)} {...props}>
    {(title || description) && (
      <legend className="mb-1 space-y-0.5 p-0">
        {title && (
          <span className="block font-mono text-micro font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
        )}
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </legend>
    )}
    <div className={cn("grid gap-4", columnClass[columns])}>{children}</div>
  </fieldset>
);
