import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendIndicatorProps {
  trend?: "increasing" | "decreasing" | "stable";
  percentChange?: number;
}

export const TrendIndicator: React.FC<TrendIndicatorProps> = ({ trend, percentChange }) => {
  const icon =
    trend === "increasing" ? (
      <TrendingUp className="h-5 w-5 text-primary" />
    ) : trend === "decreasing" ? (
      <TrendingDown className="h-5 w-5 text-primary" />
    ) : (
      <Minus className="h-5 w-5 text-primary" />
    );
  const label =
    trend === "increasing"
      ? "Higher than last month"
      : trend === "decreasing"
        ? "Lower than last month"
        : "Stable vs last month";

  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/[0.06] p-4">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-3xl font-bold text-foreground">{percentChange ?? 0}%</span>
      </div>
      <p className="mt-1 text-sm text-foreground/70">{label}</p>
    </div>
  );
};
