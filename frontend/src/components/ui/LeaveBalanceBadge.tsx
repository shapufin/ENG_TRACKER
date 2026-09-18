import React from "react";
import { Badge } from "./badge";
import { cn } from "@/lib/utils";

interface LeaveBalanceBadgeProps {
  balance: number | null | undefined;
}

export const LeaveBalanceBadge: React.FC<LeaveBalanceBadgeProps> = ({ balance }) => (
  <Badge
    variant="outline"
    className={cn(
      "font-mono font-bold",
      (balance || 0) < 5
        ? "border-tone-danger-border bg-tone-danger-surface text-tone-danger-text"
        : "border-tone-success-border bg-tone-success-surface text-tone-success-text"
    )}
  >
    {balance ?? 0}d
  </Badge>
);
