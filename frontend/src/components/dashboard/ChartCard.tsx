import React from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  delay?: number;
  className?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  description,
  delay = 0,
  className,
  action,
  children,
}) => {
  return (
    <GlassCard delay={delay} className={cn("flex flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="min-h-[220px] flex-1 p-4">{children}</div>
    </GlassCard>
  );
};
