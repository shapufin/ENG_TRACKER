import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface DashboardSectionShellProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Grid classes for the body. Defaults to the standard 2-column card grid. */
  bodyClassName?: string;
}

/**
 * Shared dashboard section shell — one header shape (title + optional badge
 * + subtitle + controls) on a standard card grid. Adopted by every dashboard
 * template so sections stay consistent.
 */
export const DashboardSectionShell: React.FC<DashboardSectionShellProps> = ({
  title,
  subtitle,
  badge,
  controls,
  children,
  className,
  bodyClassName,
}) => (
  <GlassCard className={cn("border border-border/60 bg-card", className)}>
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
    </div>
    <div className={cn("grid gap-4 p-5 pt-0 md:grid-cols-2", bodyClassName)}>{children}</div>
  </GlassCard>
);
