import React from "react";
import { StatCard, STAT_CARD_MICRO_LABEL, type StatCardProps } from "@/components/ui/StatCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { toneSurfaceClass, toneTextClass } from "@/components/ui/tone";
import { Clock, FileText, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const summaryKeys = [
  "total_hours",
  "total_entries",
  "approved_hours",
  "pending_hours",
  "rejected_hours",
] as const;

const SUMMARY_LABELS: Record<(typeof summaryKeys)[number], string> = {
  total_hours: "TOTAL HOURS",
  total_entries: "TOTAL ENTRIES",
  approved_hours: "APPROVED HOURS",
  pending_hours: "PENDING HOURS",
  rejected_hours: "REJECTED HOURS",
};

const SUMMARY_CONFIG: Record<
  (typeof summaryKeys)[number],
  {
    icon: LucideIcon;
    glow: NonNullable<StatCardProps["glow"]>;
    iconColorClass: string;
    iconWellClass: string;
    progressColorClass: string;
  }
> = {
  total_hours: {
    icon: Clock,
    glow: "primary",
    iconColorClass: toneTextClass.info,
    iconWellClass: `border ${toneSurfaceClass.info}`,
    progressColorClass: "bg-indigo-500",
  },
  total_entries: {
    icon: FileText,
    glow: "primary",
    iconColorClass: toneTextClass.accent,
    iconWellClass: `border ${toneSurfaceClass.accent}`,
    progressColorClass: "bg-purple-500",
  },
  approved_hours: {
    icon: CheckCircle,
    glow: "success",
    iconColorClass: toneTextClass.success,
    iconWellClass: `border ${toneSurfaceClass.success}`,
    progressColorClass: "bg-emerald-500",
  },
  pending_hours: {
    icon: AlertCircle,
    glow: "warning",
    iconColorClass: toneTextClass.warning,
    iconWellClass: `border ${toneSurfaceClass.warning}`,
    progressColorClass: "bg-amber-500",
  },
  rejected_hours: {
    icon: XCircle,
    glow: "destructive",
    iconColorClass: toneTextClass.danger,
    iconWellClass: `border ${toneSurfaceClass.danger}`,
    progressColorClass: "bg-rose-500",
  },
};

interface OvertimeSummaryCardsProps {
  summary: Record<(typeof summaryKeys)[number], number> | null | undefined;
  /** TL-flavored cards render a mockup-matching progress bar; Employee cards do not. */
  isTeamLeader?: boolean;
}

export const OvertimeSummaryCards: React.FC<OvertimeSummaryCardsProps> = ({
  summary,
  isTeamLeader,
}) => {
  if (!summary) return null;
  const totalHours = summary.total_hours || 0;
  const totalEntries = summary.total_entries || 0;
  const progressByKey: Record<(typeof summaryKeys)[number], number | undefined> = {
    total_hours: isTeamLeader ? (totalHours > 0 ? 100 : 0) : undefined,
    total_entries: isTeamLeader ? (totalEntries > 0 ? 100 : 0) : undefined,
    approved_hours:
      isTeamLeader && totalHours > 0 ? (summary.approved_hours / totalHours) * 100 : undefined,
    pending_hours:
      isTeamLeader && totalHours > 0 ? (summary.pending_hours / totalHours) * 100 : undefined,
    rejected_hours:
      isTeamLeader && totalHours > 0 ? (summary.rejected_hours / totalHours) * 100 : undefined,
  };
  return (
    <div className="grid gap-4 md:grid-cols-5">
      {summaryKeys.map((k, i) => {
        const cfg = SUMMARY_CONFIG[k];
        return (
          <StatCard
            key={k}
            label={SUMMARY_LABELS[k]}
            labelClassName={STAT_CARD_MICRO_LABEL}
            value={<AnimatedNumber value={summary[k]} />}
            icon={cfg.icon}
            glow={cfg.glow}
            iconColorClass={cfg.iconColorClass}
            iconWellClass={cfg.iconWellClass}
            delay={i * 0.05}
            progressPercent={progressByKey[k]}
            progressColorClass={cfg.progressColorClass}
          />
        );
      })}
    </div>
  );
};
