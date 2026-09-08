import React from "react";
import { Progress } from "@/components/ui/progress";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  sub: string;
  progress: number;
  color: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  suffix,
  sub,
  progress,
  color,
}) => {
  return (
    <div className="rounded-3xl border border-line-subtle bg-surface-sunken p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-2xl bg-card-raised p-2">{icon}</div>
        <div className="text-right">
          <div className="flex items-end gap-1">
            <span className="font-mono text-4xl font-bold tabular-nums">{value}</span>
            <span className="mb-1 text-lg text-muted-foreground">{suffix}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2 bg-line-subtle" indicatorClassName={color} />
      </div>
    </div>
  );
};
