import React from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { Loader2 } from "lucide-react";

interface LoadingCardProps {
  title?: string;
  rows?: number;
  className?: string;
  children?: React.ReactNode;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({
  title,
  rows = 3,
  className,
  children,
}) => {
  return (
    <GlassCard className={cn("p-4", className)} delay={0}>
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded bg-muted/60"
            style={{ width: `${85 - i * 15}%` }}
          />
        ))}
      </div>
      {children}
    </GlassCard>
  );
};
