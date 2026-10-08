import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  delay?: number;
  className?: string;
  action?: React.ReactNode;
  /** Marks this card as a section for PDF export (`captureChartsToPdf`). */
  sectionId?: string;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  description,
  delay = 0,
  className,
  action,
  sectionId,
  children,
}) => {
  return (
    <GlassCard
      delay={delay}
      data-chart-section={sectionId}
      className={cn("flex flex-col overflow-hidden", className)}
    >
      <div className="border-line-subtle flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </GlassCard>
  );
};
