import React from "react";
import { GlassCard } from "./GlassCard";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  delay?: number;
  glow?: "primary" | "success" | "warning" | "destructive" | "none";
  iconColorClass?: string;
  /** Optional tinted well behind the icon (e.g. "bg-accent-orange/10").
   * Omit to render the icon bare (default, backward compatible). */
  iconWellClass?: string;
  valueColorClass?: string;
  /** When set, renders a status dot next to the value with this accessible label. */
  statusDotLabel?: string;
  statusDotClassName?: string;
  /** Optional secondary line under the value (e.g. "5 pending this month"). */
  trend?: React.ReactNode;
  /**
   * Optional decorative progress bar under the trend line (TL-flavored stat
   * cards per the Obsidian-Slate mockups). 0-100. Omit for the default
   * (Employee-flavored) card, which has no bar.
   */
  progressPercent?: number;
  /** Tailwind bg-* class for the progress fill. Defaults to bg-primary. */
  progressColorClass?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  delay = 0,
  glow = "none",
  iconColorClass = "text-primary/40",
  iconWellClass,
  valueColorClass,
  statusDotLabel,
  statusDotClassName,
  trend,
  progressPercent,
  progressColorClass = "bg-primary",
}) => (
  <GlassCard delay={delay} glow={glow}>
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div
            className={cn(
              "mt-1 flex items-center gap-2 font-mono text-2xl font-bold tabular-nums",
              valueColorClass
            )}
          >
            {value}
            {statusDotLabel && (
              <span
                role="status"
                aria-label={statusDotLabel}
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full bg-success",
                  statusDotClassName
                )}
              />
            )}
          </div>
          {trend && <div className="mt-1 text-xs text-muted-foreground">{trend}</div>}
        </div>
        {iconWellClass ? (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              iconWellClass
            )}
          >
            <Icon className={`h-5 w-5 ${iconColorClass}`} />
          </div>
        ) : (
          <Icon className={`h-8 w-8 ${iconColorClass}`} />
        )}
      </div>
      {typeof progressPercent === "number" && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-input-bg">
          <div
            data-testid="stat-card-progress-fill"
            className={cn("h-full rounded-full", progressColorClass)}
            style={{ width: `${Math.round(Math.min(100, Math.max(0, progressPercent)))}%` }}
          />
        </div>
      )}
    </div>
  </GlassCard>
);
