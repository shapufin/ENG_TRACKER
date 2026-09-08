import React from "react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./GlassCard";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = "Failed to load",
  message = "Something went wrong while fetching data.",
  onRetry,
  className,
}) => {
  return (
    <GlassCard
      className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
      delay={0}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-5 w-5 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </GlassCard>
  );
};
