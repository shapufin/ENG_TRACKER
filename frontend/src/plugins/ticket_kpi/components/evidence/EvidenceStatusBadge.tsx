import React from "react";
import { Badge } from "@/components/ui/badge";
import type { EvidenceStatus } from "../../types/ticketKPI";

interface EvidenceStatusBadgeProps {
  status: EvidenceStatus;
}

export const EvidenceStatusBadge: React.FC<EvidenceStatusBadgeProps> = ({ status }) => {
  const variants: Record<EvidenceStatus, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    approved: "default",
    rejected: "destructive",
  };

  return (
    <Badge variant={variants[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  );
};
