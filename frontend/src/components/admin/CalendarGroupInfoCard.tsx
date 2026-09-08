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
    <GlassCard isHoverLift={false} glow={gradient ? "primary" : "none"} className="p-7">
      <div className="flex gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-8 w-8 text-primary" />
        </div>

        <div className="flex-1">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {trackingLabel}
          </p>

          <h2 className="text-3xl font-semibold leading-tight">{title}</h2>

          <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">{description}</p>

          {exampleTitle && exampleText && (
            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <p className="mb-2 text-sm font-semibold text-foreground">{exampleTitle}</p>

              <p className="text-sm leading-7 text-foreground/80">{exampleText}</p>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
