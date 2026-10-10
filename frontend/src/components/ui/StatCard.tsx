import React from "react";
import { GlassCard } from "./GlassCard";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { IconWell } from "./IconWell";
import type { Tone } from "./tone";
import { cn } from "@/lib/utils";

/** Uppercase micro-label shared by every metric card (scorecard language). */
export const STAT_CARD_MICRO_LABEL = "font-semibold uppercase tracking-wider";

export interface StatDelta {
  /** Display text, already formatted from real data, e.g. "+4 new hires · 30d". */
  text: string;
  direction: "up" | "down" | "flat";
  /** Semantic colour; default "neutral". Only pass success/danger when the payload says which way is good. */
  tone?: "success" | "danger" | "warning" | "neutral";
}

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const;
const DELTA_TONE_CLASS = {
  success: "text-tone-success-text",
  danger: "text-tone-danger-text",
  warning: "text-tone-warning-text",
  neutral: "text-muted-foreground",
} as const;

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
  /** Optional bottom strip (mockup KPI footer: left/right pair). Omit = card unchanged. */
  footer?: React.ReactNode;
  /** Optional extra label classes (e.g. scorecard micro-labels). Omit = default label. */
  labelClassName?: string;
  /** Renders an IconWell with this tone (top-right) instead of the bare icon. */
  iconTone?: Tone;
  /** Delta line under the value (before `trend`). */
  delta?: StatDelta;
  /** Whole card becomes a react-router Link. */
  to?: string;
  /** Whole card becomes a button. Mutually exclusive with `to`. */
  onClick?: () => void;
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
  footer,
  labelClassName,
  iconTone,
  delta,
  to,
  onClick,
}) => {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;
  const content = (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("text-muted-foreground text-xs", labelClassName)}>{label}</p>
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
                  "bg-success inline-block h-2 w-2 shrink-0 rounded-full",
                  statusDotClassName
                )}
              />
            )}
          </div>
          {delta && DeltaIcon && (
            <div
              className={cn(
                "mt-1 flex items-center gap-1 text-xs",
                DELTA_TONE_CLASS[delta.tone ?? "neutral"]
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {delta.text}
            </div>
          )}
          {trend && <div className="text-muted-foreground mt-1 text-xs">{trend}</div>}
        </div>
        {iconTone ? (
          <IconWell tone={iconTone} size="md">
            <Icon className="h-5 w-5" />
          </IconWell>
        ) : iconWellClass ? (
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              iconWellClass
            )}
          >
            <Icon className={`h-5 w-5 ${iconColorClass}`} />
          </div>
        ) : (
          <Icon className={`h-6 w-6 shrink-0 ${iconColorClass}`} />
        )}
      </div>
      {typeof progressPercent === "number" && (
        <div className="bg-input-bg mt-2.5 h-1.5 w-full overflow-hidden rounded-full">
          <div
            data-testid="stat-card-progress-fill"
            className={cn("h-full rounded-full", progressColorClass)}
            style={{ width: `${Math.round(Math.min(100, Math.max(0, progressPercent)))}%` }}
          />
        </div>
      )}
      {footer && (
        <div
          data-testid="stat-card-footer"
          className="border-line-subtle mt-2.5 flex items-center justify-between gap-2 border-t pt-2 text-xs"
        >
          {footer}
        </div>
      )}
    </div>
  );
  const ariaLabel = `${label}: ${typeof value === "string" || typeof value === "number" ? value : ""}`;
  const focus = "focus-visible:ring-focus focus-visible:outline-none focus-visible:ring-2";
  const interactive = Boolean(to || onClick);
  return (
    <GlassCard delay={delay} glow={glow} interactive={interactive}>
      {to ? (
        <Link
          to={to}
          aria-label={ariaLabel}
          className={cn("block h-full rounded-xl text-left", focus)}
        >
          {content}
        </Link>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel}
          className={cn("block h-full w-full rounded-xl text-left", focus)}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </GlassCard>
  );
};
