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
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-green-200 bg-green-50 text-green-700"
    )}
  >
    {balance ?? 0}d
  </Badge>
);
