import React from "react";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number;
  label: string;
  colorClass?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({ value, label, colorClass }) => (
  <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-3">
    <div className="relative h-12 w-12">
      <svg className="h-full w-full" viewBox="0 0 36 36">
        <path
          className="text-muted"
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          strokeDasharray="100, 100"
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
        <path
          className={cn("origin-center rotate-[-90deg] text-primary transition-all", colorClass)}
          strokeWidth="3"
          stroke="currentColor"
          fill="transparent"
          strokeDasharray={`${Math.min(100, Math.max(0, value))}, 100`}
          d="M18 2.0845
            a 15.9155 15.9155 0 0 1 0 31.831
            a 15.9155 15.9155 0 0 1 0 -31.831"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-semibold">
        <span>{Math.round(value)}%</span>
      </div>
    </div>
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">Progress toward goal</p>
    </div>
  </div>
);
