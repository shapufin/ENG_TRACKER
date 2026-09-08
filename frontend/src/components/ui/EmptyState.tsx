import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Decorative icon shown inside the muted circle. Hidden from assistive tech. */
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional CTA slot (e.g. a Button). Rendered only when provided. */
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn("flex flex-col items-center gap-3 p-12 text-center", className)}>
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
    </div>
    <div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
    {action && <div className="flex flex-wrap items-center justify-center gap-2">{action}</div>}
  </div>
);
