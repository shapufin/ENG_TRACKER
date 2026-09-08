import React from "react";
import { cn } from "@/lib/utils";

interface MetricBarProps {
  label: string;
  value: string;
  progress: number;
  colorClass?: string;
}

export const MetricBar: React.FC<MetricBarProps> = ({
  label,
  value,
  progress,
  colorClass = "bg-primary",
}) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-[9px] text-muted-foreground">
      <span>{label}</span>
      <span className="text-[8.5px] text-muted-foreground">{value}</span>
    </div>
    <div className="h-1 overflow-hidden rounded-full bg-line-subtle">
      <div
        className={cn("h-full rounded-full transition-all", colorClass)}
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);
