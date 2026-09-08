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
    <GlassCard isHoverLift={false} className="p-7">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="h-7 w-7 text-primary" />
        </div>

        <div>
          <h3 className="text-xl font-semibold">{title}</h3>

          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        {steps.map((step, index) => (
          <div key={step} className="flex gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </div>

            <p className="pt-1 text-sm text-foreground/80">{step}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
