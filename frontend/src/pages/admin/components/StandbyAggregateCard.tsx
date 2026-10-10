import React from "react";
import { Briefcase } from "lucide-react";
import { AggregateCard } from "./AggregateCard";

interface StandbyAggregateCardProps {
  total_hours: number;
  approved_hours: number;
  total_entries: number;
  pending_count: number;
}

export const StandbyAggregateCard: React.FC<StandbyAggregateCardProps> = (props) => (
  <AggregateCard
    title="Standby Aggregate"
    description="Total on-call readiness capacity"
    icon={Briefcase}
    totalLabel="Total Hours Logged"
    approvedLabel="Verified & Approved"
    pendingLabel="pending review"
    {...props}
  />
);
