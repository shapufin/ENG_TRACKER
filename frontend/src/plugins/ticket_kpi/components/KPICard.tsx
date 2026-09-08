import React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  /** Delta vs previous period. Positive = green for "higher is better" metrics,
   *  green for "lower is better" metrics when `lowerIsBetter` is true. */
  delta?: number | null;
  /** Human-readable label for the delta (e.g. "vs last month"). */
  deltaLabel?: string;
  /** When true, a negative delta is good (e.g. resolution time). */
  lowerIsBetter?: boolean;
  /** TL-flavored cards render a mockup-matching progress bar; Employee cards do not. */
  progressPercent?: number;
  progressColorClass?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  delta,
  deltaLabel,
  lowerIsBetter = false,
  progressPercent,
  progressColorClass,
}) => {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isPositive = hasDelta && delta! > 0;
  const isNegative = hasDelta && delta! < 0;
  const isGood = hasDelta && (lowerIsBetter ? isNegative : isPositive);
  const isBad = hasDelta && (lowerIsBetter ? isPositive : isNegative);

  const deltaContent = hasDelta ? (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
        isGood && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        isBad && "bg-red-500/10 text-red-600 dark:text-red-400",
        !isGood && !isBad && "bg-muted text-muted-foreground"
      )}
      title={deltaLabel}
    >
      {isPositive && <ArrowUp className="h-3 w-3" />}
      {isNegative && <ArrowDown className="h-3 w-3" />}
      {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
      {isPositive ? "+" : ""}
      {Number.isInteger(delta) ? delta : delta!.toFixed(1)}
    </span>
  ) : null;

  return (
    <StatCard
      label={title}
      value={value}
      icon={Icon}
      iconColorClass="text-muted-foreground"
      trend={
        <>
          <span>{subtitle}</span>
          {deltaContent && <span className="ml-2">{deltaContent}</span>}
        </>
      }
      progressPercent={progressPercent}
      progressColorClass={progressColorClass}
    />
  );
};
