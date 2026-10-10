import React from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title: string;
  /** Plain text or composed meta (e.g. text + avatar stack); rendered as-is. */
  subtitle?: React.ReactNode;
  category?: string;
  /** Optional badge rendered inline next to the title (e.g. a status pill). */
  titleBadge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const PageShellComponent: React.FC<PageShellProps> = ({
  title,
  subtitle,
  category,
  titleBadge,
  actions,
  children,
  className,
}) => {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="border-line-subtle flex flex-col gap-4 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {category && (
            <p className="text-muted-foreground text-xs tracking-[0.25em] uppercase">{category}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {titleBadge}
          </div>
          {subtitle && (
            <div className="text-muted-foreground mt-2 text-sm sm:text-base">{subtitle}</div>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
};

export const PageShell = React.memo(PageShellComponent);
PageShell.displayName = "PageShell";
