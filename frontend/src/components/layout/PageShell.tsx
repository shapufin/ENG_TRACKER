import React from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title: string;
  subtitle?: string;
  category?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const PageShellComponent: React.FC<PageShellProps> = ({
  title,
  subtitle,
  category,
  actions,
  children,
  className,
}) => {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col gap-4 border-b border-line-subtle pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {category && (
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{category}</p>
          )}
          <h1 className="text-2xl font-black tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
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
