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
    <GlassCard glow={gradient ? "primary" : "none"} className="p-5">
      <div className="flex gap-4">
        <div className="bg-primary/10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Icon className="text-primary h-5 w-5" />
        </div>

        <div className="flex-1">
          <p className="text-muted-foreground mb-1 text-xs tracking-[0.2em] uppercase">
            {trackingLabel}
          </p>

          <h2 className="text-lg leading-tight font-semibold">{title}</h2>

          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">{description}</p>

          {exampleTitle && exampleText && (
            <div className="border-primary/20 bg-primary/5 mt-4 rounded-xl border p-3">
              <p className="text-foreground mb-1 text-xs font-semibold">{exampleTitle}</p>

              <p className="text-foreground/80 text-xs leading-6">{exampleText}</p>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
