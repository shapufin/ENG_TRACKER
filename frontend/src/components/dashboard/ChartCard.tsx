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
      <div className="border-border/60 flex items-center justify-between border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
        </div>
        {action}
      </div>
      <div className="min-h-[220px] flex-1 p-5">{children}</div>
    </GlassCard>
  );
};
