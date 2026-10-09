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
    <GlassCard className="p-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <Icon className="text-primary h-5 w-5" />
        </div>

        <div>
          <h3 className="text-sm font-semibold">{title}</h3>

          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <div key={step} className="flex gap-3">
            <div className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {index + 1}
            </div>

            <p className="text-foreground/80 pt-0.5 text-xs">{step}</p>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};
