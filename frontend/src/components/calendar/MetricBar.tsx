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
    <div className="text-muted-foreground flex items-center justify-between text-xs">
      <span>{label}</span>
      <span className="text-muted-foreground text-xs">{value}</span>
    </div>
    <div className="bg-line-subtle h-1 overflow-hidden rounded-full">
      <div
        className={cn("h-full rounded-full transition-all", colorClass)}
        style={{ width: `${progress}%` }}
      />
    </div>
  </div>
);
