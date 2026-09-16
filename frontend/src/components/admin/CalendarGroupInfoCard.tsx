import React from "react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface CalendarGroupInfoCardProps {
  icon: LucideIcon;
  trackingLabel: string;
  title: string;
  description: string;
  exampleTitle?: string;
  exampleText?: string;
  gradient?: boolean;
}

export const CalendarGroupInfoCard: React.FC<CalendarGroupInfoCardProps> = ({
  icon: Icon,
  trackingLabel,
  title,
  description,
  exampleTitle,
  exampleText,
  gradient = false,
}) => {
  return (
    <GlassCard isHoverLift={false} glow={gradient ? "primary" : "none"} className="p-5">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1">
          <p className="mb-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {trackingLabel}
          </p>

          <h2 className="text-lg font-semibold leading-tight">{title}</h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>

          {exampleTitle && exampleText && (
            <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="mb-1 text-xs font-semibold text-foreground">{exampleTitle}</p>

              <p className="text-xs leading-6 text-foreground/80">{exampleText}</p>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
