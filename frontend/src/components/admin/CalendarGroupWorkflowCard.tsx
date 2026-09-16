import React from "react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";

interface CalendarGroupWorkflowCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  steps: string[];
}

export const CalendarGroupWorkflowCard: React.FC<CalendarGroupWorkflowCardProps> = ({
  icon: Icon,
  title,
  subtitle,
  steps,
}) => {
  return (
    <GlassCard isHoverLift={false} className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>

        <div>
          <h3 className="text-sm font-semibold">{title}</h3>

          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div key={step} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {index + 1}
            </div>

            <p className="pt-0.5 text-xs text-foreground/80">{step}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
