import React from "react";
import { Badge } from "@/components/ui/badge";

type StatusVariant = "pending" | "approved" | "rejected";

interface StatusBadgeProps {
  variant: StatusVariant;
}

const styles: Record<StatusVariant, string> = {
  pending: "bg-warning/10 text-amber-700 dark:text-warning border-warning/20",
  approved: "bg-success/10 text-emerald-700 dark:text-success border-success/20",
  rejected: "bg-destructive/10 text-rose-700 dark:text-destructive border-destructive/20",
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ variant }) => (
  <Badge variant="default" className={styles[variant]}>
    {variant.charAt(0).toUpperCase() + variant.slice(1)}
  </Badge>
);
