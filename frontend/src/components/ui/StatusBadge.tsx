import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertCircle, Ban } from "lucide-react";

export type StatusVariant = "pending" | "approved" | "rejected" | "cancelled";

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
  isCompact?: boolean;
  isShowIcon?: boolean;
}

const VARIANT_CONFIG: Record<
  StatusVariant,
  {
    base: string;
    text: string;
    border: string;
    icon: React.ElementType;
    defaultLabel: string;
  }
> = {
  pending: {
    base: "bg-warning/10",
    text: "text-amber-700 dark:text-warning",
    border: "border-warning/20",
    icon: AlertCircle,
    defaultLabel: "Pending",
  },
  approved: {
    base: "bg-success/10",
    text: "text-emerald-700 dark:text-success",
    border: "border-success/20",
    icon: CheckCircle2,
    defaultLabel: "Approved",
  },
  rejected: {
    base: "bg-destructive/10",
    text: "text-rose-700 dark:text-destructive",
    border: "border-destructive/20",
    icon: XCircle,
    defaultLabel: "Rejected",
  },
  cancelled: {
    base: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    icon: Ban,
    defaultLabel: "Cancelled",
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant,
  label,
  className,
  isCompact = false,
  isShowIcon = true,
}) => {
  const cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.pending;
  const Icon = cfg.icon;

  return (
    <div
      role="status"
      aria-label={label || cfg.defaultLabel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm transition-colors",
        cfg.base,
        cfg.text,
        cfg.border,
        isCompact && "gap-1 px-1.5 py-0 text-[10px]",
        className
      )}
    >
      {isShowIcon && (
        <Icon className={cn("h-3.5 w-3.5 shrink-0", isCompact && "h-3 w-3")} aria-hidden="true" />
      )}
      <span className="truncate">{label || cfg.defaultLabel}</span>
    </div>
  );
};
