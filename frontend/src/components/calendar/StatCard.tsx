import React from "react";
import { cn } from "@/lib/utils";
import { toneTextClass } from "@/components/ui/tone";

interface MiniStatCardProps {
  label: string;
  value: string;
  suffix: string;
  sub: string;
  tone: "success" | "warning" | "danger";
}

const toneMap = {
  success: toneTextClass.success,
  warning: toneTextClass.warning,
  danger: toneTextClass.danger,
} as const;

/**
 * Compact balance stat for the vacation modal: label-first hierarchy, trimmed
 * value, no per-card progress bar (the summary band owns the single bar).
 */
export const StatCard: React.FC<MiniStatCardProps> = ({ label, value, suffix, sub, tone }) => {
  return (
    <div className="rounded-2xl border border-line-subtle bg-card p-4">
      <div className="flex items-center gap-1.5">
        <span className={cn("inline-flex", toneMap[tone])} aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        </span>
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold tabular-nums text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      <p className="mt-1 font-mono text-micro-lg tabular-nums text-muted-foreground">{sub}</p>
    </div>
  );
};
